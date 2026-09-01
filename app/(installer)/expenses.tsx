import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '@/components/ScreenHeader';
import EmptyState from '@/components/EmptyState';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authFetch, authFormFetch } from '@/lib/api';
import * as ImagePicker from 'expo-image-picker';

const C = {
  bg: '#0f1923', card: '#1a2635', teal: '#00d4a0', muted: '#4d6478',
  text: '#ffffff', border: 'rgba(255,255,255,0.05)',
  red: '#f87171', amber: '#fbbf24', green: '#10b981', purple: '#BC6AFF',
};

interface Expense {
  id: string;
  amount: number;
  vat_amount: number | null;
  category: string;
  note: string | null;
  receipt_url: string | null;
  status: 'submitted' | 'approved' | 'rejected' | 'queried' | 'paid';
  submitted_at: string;
  review_note: string | null;
  job_id: string | null;
}

interface ScanResult {
  amount: number | null;
  vat_amount: number | null;
  vendor: string | null;
  date: string | null;
  suggested_category: string;
  currency: string;
  confidence: 'high' | 'medium' | 'low';
}

interface JobOption {
  id: string;
  name: string;
  address?: string;
}

const CATEGORIES = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'materials', label: 'Materials' },
  { value: 'food', label: 'Food' },
  { value: 'parking', label: 'Parking' },
  { value: 'tools', label: 'Tools' },
  { value: 'other', label: 'Other' },
];

export default function ExpensesScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const initialJobId = params.id || null;
  const initialJobName = params.name || null;

  const { user } = useAuth();
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [jobs, setJobs] = useState<JobOption[]>([]);

  // Add flow state
  const [step, setStep] = useState<'photo' | 'reading' | 'confirm'>('photo');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [category, setCategory] = useState('other');
  const [note, setNote] = useState('');
  const [tagJobId, setTagJobId] = useState<string | null>(initialJobId);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = initialJobId ? '/api/expenses?jobId=' + initialJobId : '/api/expenses';
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses || []);
      }
    } catch (e) {
      console.error('[expenses] load failed', e);
    }
    setLoading(false);
  }, [initialJobId]);

  // Load jobs for the picker
  const loadJobs = useCallback(async () => {
    try {
      const res = await authFetch('/api/installer/jobs');
      if (res.ok) {
        const data = await res.json();
        const jobList: JobOption[] = (data.jobs || []).map((j: any) => ({
          id: j.id,
          name: j.name,
          address: j.address,
        }));
        setJobs(jobList);
      }
    } catch (e) {
      console.error('[expenses] loadJobs failed', e);
    }
  }, []);

  useEffect(() => { load(); loadJobs(); }, [initialJobId]);

  function openAdd() {
    setStep('photo');
    setReceiptUri(null);
    setScanResult(null);
    setAmount('');
    setVendor('');
    setCategory('other');
    setNote('');
    setTagJobId(initialJobId);
    setFormError('');
    setShowAdd(true);
  }

  function closeAdd() {
    if (submitting) return;
    setShowAdd(false);
  }

  async function captureAndScan(source: 'camera' | 'gallery') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Vantro needs ' + source + ' access');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setReceiptUri(uri);
    setStep('reading');

    try {
      const filename = 'scan_' + Date.now() + '.jpg';
      const form = new FormData();
      form.append('receipt', { uri, name: filename, type: 'image/jpeg' } as any);

      const res = await authFormFetch('/api/expenses/scan-receipt', form);
      const data = await res.json();

      if (res.ok && data.scan) {
        const scan: ScanResult = data.scan;
        setScanResult(scan);
        setAmount(scan.amount ? scan.amount.toFixed(2) : '');
        setVendor(scan.vendor || '');
        setCategory(scan.suggested_category || 'other');
        setStep('confirm');
      } else {
        setScanResult({ amount: null, vat_amount: null, vendor: null, date: null, suggested_category: 'other', currency: 'GBP', confidence: 'low' });
        setStep('confirm');
      }
    } catch (e: any) {
      console.error('[expenses] scan failed', e);
      setScanResult({ amount: null, vat_amount: null, vendor: null, date: null, suggested_category: 'other', currency: 'GBP', confidence: 'low' });
      setStep('confirm');
    }
  }

  async function submit() {
    setFormError('');
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Enter a valid amount');
      return;
    }
    if (!receiptUri) {
      setFormError('Receipt photo missing');
      return;
    }

    setSubmitting(true);
    try {
      const filename = 'receipt_' + Date.now() + '.jpg';
      const form = new FormData();
      form.append('receipt', { uri: receiptUri, name: filename, type: 'image/jpeg' } as any);
      form.append('amount', amt.toFixed(2));
      form.append('category', category);
      if (tagJobId) form.append('job_id', tagJobId);

      const finalNote = [vendor, note.trim()].filter(Boolean).join(' - ');
      if (finalNote) form.append('note', finalNote);

      if (scanResult?.vat_amount != null) {
        form.append('vat_amount', scanResult.vat_amount.toFixed(2));
      }

      const res = await authFormFetch('/api/expenses', form);
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Failed to submit');
        setSubmitting(false);
        return;
      }

      closeAdd();
      await load();
    } catch (e: any) {
      console.error('[expenses] submit failed', e);
      setFormError(e?.message || 'Network error');
    }
    setSubmitting(false);
  }

  function statusColor(status: string) {
    switch (status) {
      case 'approved': return C.green;
      case 'rejected': return C.red;
      case 'queried': return C.amber;
      case 'paid': return C.purple;
      default: return C.muted;
    }
  }

  const totalSubmitted = expenses.filter(e => e.status === 'submitted').reduce((s, e) => s + Number(e.amount), 0);
  const totalApproved = expenses.filter(e => e.status === 'approved' || e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0);

  const tagJobName = tagJobId ? (jobs.find(j => j.id === tagJobId)?.name || 'Unknown') : null;

  return (
    <View style={s.safe}>
      <ScreenHeader
        title={initialJobName || 'My expenses'}
        subtitle={initialJobName ? 'Receipts on this job' : 'All your receipts'}
        onBack={router.canGoBack() ? () => router.back() : undefined}
        right={
          <TouchableOpacity onPress={openAdd} style={s.addBtn}>
            <Text style={s.addBtnTxt}>+ Snap</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {expenses.length > 0 && (
          <View style={s.summaryRow}>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>Submitted</Text>
              <Text style={s.summaryAmount}>{'\u00A3' + totalSubmitted.toFixed(2)}</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryLabel}>Approved + paid</Text>
              <Text style={[s.summaryAmount, { color: C.green }]}>{'\u00A3' + totalApproved.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={C.teal} />
          </View>
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No receipts yet"
            body="Tap Snap to capture one. It reads the amount for you."
            actionLabel="Snap a receipt"
            onAction={openAdd}
          />
        ) : (
          expenses.map(exp => {
            const cat = CATEGORIES.find(c => c.value === exp.category) || CATEGORIES[5];
            const submittedDate = new Date(exp.submitted_at);
            const jobName = exp.job_id ? jobs.find(j => j.id === exp.job_id)?.name : null;
            return (
              <View key={exp.id} style={s.entry}>
                {exp.receipt_url && (
                  <Image source={{ uri: exp.receipt_url }} style={s.receiptThumb} />
                )}
                <View style={{ flex: 1 }}>
                  <View style={s.entryHeader}>
                    <Text style={s.entryAmount}>{'\u00A3' + Number(exp.amount).toFixed(2)}</Text>
                    <View style={[s.statusBadge, { backgroundColor: statusColor(exp.status) + '22' }]}>
                      <Text style={[s.statusTxt, { color: statusColor(exp.status) }]}>{exp.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={s.entryCategory}>{cat.label}{jobName ? ' \u00B7 ' + jobName : ''}</Text>
                  {exp.note ? <Text style={s.entryNote}>{exp.note}</Text> : null}
                  <Text style={s.entryDate}>
                    {submittedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {'\u00B7'} {submittedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {exp.review_note && (
                    <View style={[s.reviewBox, { borderColor: statusColor(exp.status) + '40', backgroundColor: statusColor(exp.status) + '15' }]}>
                      <Text style={[s.reviewLabel, { color: statusColor(exp.status) }]}>Admin note</Text>
                      <Text style={s.reviewText}>{exp.review_note}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showAdd} animationType='slide' presentationStyle='pageSheet' onRequestClose={closeAdd}>
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={closeAdd} disabled={submitting || step === 'reading'}>
              <Text style={[s.modalCancel, (submitting || step === 'reading') && { opacity: 0.4 }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>
              {step === 'photo' ? 'New expense' : step === 'reading' ? 'Reading receipt' : 'Confirm details'}
            </Text>
            {step === 'confirm' ? (
              <TouchableOpacity onPress={submit} disabled={submitting || !amount}>
                <Text style={[s.modalSubmit, (submitting || !amount) && { opacity: 0.4 }]}>
                  {submitting ? '...' : 'Submit'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 60 }} />
            )}
          </View>

          {step === 'photo' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
              <Text style={s.bigLabel}>Snap the receipt</Text>
              <Text style={s.bigSub}>We'll read the amount, vendor and date automatically.</Text>

              <TouchableOpacity onPress={() => captureAndScan('camera')} style={s.bigBtn}>
                <Text style={s.bigBtnTxt}>Take photo</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => captureAndScan('gallery')} style={s.bigBtnSecondary}>
                <Text style={s.bigBtnSecondaryTxt}>Pick from gallery</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {step === 'reading' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              {receiptUri && (
                <Image source={{ uri: receiptUri }} style={{ width: 200, height: 280, borderRadius: 12, marginBottom: 24 }} />
              )}
              <ActivityIndicator color={C.teal} size='large' />
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 16 }}>Reading receipt...</Text>
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>This usually takes 2-3 seconds</Text>
            </View>
          )}

          {step === 'confirm' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {receiptUri && (
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <Image source={{ uri: receiptUri }} style={{ width: 120, height: 160, borderRadius: 8 }} />
                  <TouchableOpacity onPress={() => setStep('photo')} style={{ marginTop: 8 }}>
                    <Text style={{ color: C.teal, fontSize: 13 }}>Retake</Text>
                  </TouchableOpacity>
                </View>
              )}

              {scanResult && scanResult.confidence === 'low' && (
                <View style={s.warningBox}>
                  <Text style={s.warningText}>Couldn't read the receipt clearly - please fill in below.</Text>
                </View>
              )}

              {scanResult && scanResult.confidence === 'high' && (
                <View style={s.successBox}>
                  <Text style={s.successText}>Receipt read - please confirm</Text>
                </View>
              )}

              <Text style={s.fieldLabel}>AMOUNT</Text>
              <View style={s.amountWrap}>
                <Text style={s.amountPrefix}>{'\u00A3'}</Text>
                <TextInput
                  style={s.amountInput}
                  placeholder='0.00'
                  placeholderTextColor={C.muted}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType='decimal-pad'
                  returnKeyType='done'
                />
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>VENDOR</Text>
              <TextInput
                style={s.textInput}
                placeholder='e.g. Screwfix'
                placeholderTextColor={C.muted}
                value={vendor}
                onChangeText={setVendor}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>CATEGORY</Text>
              <View style={s.categoryGrid}>
                {CATEGORIES.map(cat => {
                  const active = category === cat.value;
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      onPress={() => setCategory(cat.value)}
                      style={[s.categoryBtn, active && s.categoryBtnActive]}
                    >
                      <Text style={[s.categoryLabel, active && s.categoryLabelActive]}>{cat.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>TAG JOB (OPTIONAL)</Text>
              <TouchableOpacity onPress={() => setShowJobPicker(true)} style={s.jobPicker}>
                <Text style={[s.jobPickerText, !tagJobName && { color: C.muted }]}>
                  {tagJobName || 'No job tagged'}
                </Text>
                <Text style={{ color: C.teal, fontSize: 13 }}>{tagJobName ? 'Change' : 'Pick'}</Text>
              </TouchableOpacity>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>NOTE (OPTIONAL)</Text>
              <TextInput
                style={s.noteInput}
                placeholder='Anything else useful'
                placeholderTextColor={C.muted}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={500}
              />

              {formError ? (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>{formError}</Text>
                </View>
              ) : null}

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Job picker modal */}
      <Modal visible={showJobPicker} animationType='slide' presentationStyle='pageSheet' onRequestClose={() => setShowJobPicker(false)}>
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowJobPicker(false)}>
              <Text style={s.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Tag a job</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <TouchableOpacity
              onPress={() => { setTagJobId(null); setShowJobPicker(false); }}
              style={[s.jobOption, !tagJobId && s.jobOptionActive]}
            >
              <Text style={[s.jobOptionText, !tagJobId && { color: C.teal }]}>No job</Text>
              <Text style={s.jobOptionSub}>Admin can tag later</Text>
            </TouchableOpacity>
            {jobs.map(job => {
              const active = tagJobId === job.id;
              return (
                <TouchableOpacity
                  key={job.id}
                  onPress={() => { setTagJobId(job.id); setShowJobPicker(false); }}
                  style={[s.jobOption, active && s.jobOptionActive]}
                >
                  <Text style={[s.jobOptionText, active && { color: C.teal }]}>{job.name}</Text>
                  {job.address ? <Text style={s.jobOptionSub}>{job.address}</Text> : null}
                </TouchableOpacity>
              );
            })}
            {jobs.length === 0 && (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: C.muted, fontSize: 14 }}>No jobs available</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { marginRight: 12, padding: 4 },
  backTxt: { color: C.teal, fontSize: 22 },
  title: { color: C.text, fontSize: 16, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  addBtn: { backgroundColor: C.teal, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnTxt: { color: C.bg, fontWeight: '700', fontSize: 14 },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12 },
  summaryLabel: { color: C.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryAmount: { color: C.text, fontSize: 22, fontWeight: '700', marginTop: 4 },

  empty: { paddingVertical: 60, alignItems: 'center' },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 4 },
  emptySub: { color: C.muted, fontSize: 14 },

  entry: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 10, gap: 12 },
  receiptThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: C.bg },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  entryAmount: { color: C.text, fontSize: 18, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  entryCategory: { color: '#cbd5e1', fontSize: 13, marginBottom: 2 },
  entryNote: { color: '#a8b3bf', fontSize: 13, marginTop: 2, fontStyle: 'italic' },
  entryDate: { color: C.muted, fontSize: 11, marginTop: 4 },
  reviewBox: { marginTop: 8, borderRadius: 8, padding: 8, borderWidth: 1 },
  reviewLabel: { fontSize: 10, fontWeight: '700', marginBottom: 2, letterSpacing: 0.3 },
  reviewText: { color: C.text, fontSize: 13 },

  modalSafe: { flex: 1, backgroundColor: C.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalCancel: { color: C.muted, fontSize: 16, width: 60 },
  modalTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  modalSubmit: { color: C.teal, fontSize: 16, fontWeight: '700', width: 60, textAlign: 'right' },

  bigLabel: { color: C.text, fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  bigSub: { color: C.muted, fontSize: 14, marginBottom: 32, textAlign: 'center' },
  bigBtn: { backgroundColor: C.teal, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
  bigBtnTxt: { color: C.bg, fontSize: 17, fontWeight: '700' },
  bigBtnSecondary: { backgroundColor: C.card, borderRadius: 14, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  bigBtnSecondaryTxt: { color: C.teal, fontSize: 16, fontWeight: '600' },

  warningBox: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.4)', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  warningText: { color: C.amber, fontSize: 13 },
  successBox: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.4)', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  successText: { color: C.green, fontSize: 13, fontWeight: '600' },

  fieldLabel: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14 },
  amountPrefix: { color: C.text, fontSize: 28, fontWeight: '700', marginRight: 8 },
  amountInput: { flex: 1, color: C.text, fontSize: 28, fontWeight: '700', paddingVertical: 14 },

  textInput: { backgroundColor: C.card, borderRadius: 12, padding: 14, color: C.text, fontSize: 16 },
  noteInput: { backgroundColor: C.card, borderRadius: 12, padding: 12, color: C.text, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryBtn: { width: '31%', backgroundColor: C.card, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  categoryBtnActive: { borderColor: C.teal, backgroundColor: 'rgba(0,212,160,0.12)' },
  categoryLabel: { color: '#a8b3bf', fontSize: 13, fontWeight: '600' },
  categoryLabelActive: { color: C.teal },

  jobPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 12, padding: 14 },
  jobPickerText: { color: C.text, fontSize: 15, flex: 1 },

  jobOption: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  jobOptionActive: { borderColor: C.teal, backgroundColor: 'rgba(0,212,160,0.08)' },
  jobOptionText: { color: C.text, fontSize: 15, fontWeight: '600' },
  jobOptionSub: { color: C.muted, fontSize: 12, marginTop: 2 },

  errorBox: { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.4)', borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 16 },
  errorText: { color: C.red, fontSize: 13 },
});
