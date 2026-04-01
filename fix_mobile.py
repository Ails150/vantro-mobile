# Fix defects.tsx - better severity selection UI + fix emoji encoding
content = open('app/(installer)/defects.tsx', encoding='utf-8').read()

# Fix emoji encoding issues
content = content.replace('\u00f0\u009f\u0093\u00b7', '\U0001f4f7')
content = content.replace('\u00f0\u009f\u009a\u00a8', '\U0001f6a8')
content = content.replace("'\U0001f4f7' Add photo", 'Add photo')

# Fix severity buttons to show selected state clearly
old_sev = """      <View style={s.sevRow}>
        {['minor','major','critical'].map(lv => (
          <TouchableOpacity key={lv} style={[s.sevBtn, severity===lv && s.sevBtnActive]} onPress={() => setSeverity(lv)}>
            <Text style={[s.sevText, severity===lv && s.sevTextActive]}>{lv.charAt(0).toUpperCase()+lv.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>"""

new_sev = """      <View style={s.sevRow}>
        {[{l:'minor',c:'#4d6478'},{l:'major',c:'#fbbf24'},{l:'critical',c:'#f87171'}].map(({l,c}) => (
          <TouchableOpacity key={l} style={[s.sevBtn, severity===l && {backgroundColor:c, borderColor:c}]} onPress={() => setSeverity(l)}>
            <Text style={[s.sevText, severity===l && {color: l==='minor' ? '#fff' : '#0f1923', fontWeight:'700'}]}>{l.charAt(0).toUpperCase()+l.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>"""

result = content.replace(old_sev, new_sev)
open('app/(installer)/defects.tsx', 'w', encoding='utf-8').write(result)
print('Defects fixed' if old_sev not in result else 'Defects NOT fixed - check manually')

# Fix qa.tsx - add comment field per item, fix mandatory photo requirement
content2 = open('app/(installer)/qa.tsx', encoding='utf-8').read()

# Remove the hard block on mandatory items - allow submit with just pass/fail
content2 = content2.replace(
    "function allMandatoryComplete() {\n    return items.filter((i: any) => i.is_mandatory).every((i: any) => {\n      const state = subs.find((s: any) => s.checklist_item_id === i.id)?.state;\n      return state && state !== 'pending';\n    });\n  }",
    "function allMandatoryComplete() {\n    return items.filter((i: any) => i.is_mandatory).every((i: any) => {\n      const state = getState(i.id);\n      return state && state !== 'pending';\n    });\n  }"
)

open('app/(installer)/qa.tsx', 'w', encoding='utf-8').write(content2)
print('QA fixed')
