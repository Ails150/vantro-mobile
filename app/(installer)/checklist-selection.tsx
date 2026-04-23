import { useState, useEffect } from "react"
import { View, Text, Pressable, Alert, ScrollView } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"

export default function ChecklistSelection() {
  const { jobId } = useLocalSearchParams()
  const { user } = useAuth()
  const [checklists, setChecklists] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChecklists()
  }, [])

  const fetchChecklists = async () => {
    try {
      const { data, error } = await supabase
        .from("checklists")
        .select("id, name, description")
        .eq("company_id", user?.companyId)
        .eq("active", true)
        .order("name")

      if (error) throw error
      setChecklists(data || [])
    } catch (error) {
      console.error("Error fetching checklists:", error)
      Alert.alert("Error", "Failed to load checklists")
    } finally {
      setLoading(false)
    }
  }

  const selectChecklist = (checklistId) => {
    router.push(`/(installer)/job-execution?jobId=${jobId}&checklistId=${checklistId}`)
  }

  if (loading) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <Text className="text-gray-600">Loading checklists...</Text>
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-6">
        <Text className="text-2xl font-bold text-gray-900 mb-2">Select Checklist</Text>
        <Text className="text-gray-600 mb-6">Choose the checklist for this job</Text>

        <View className="space-y-3">
          {checklists.map(checklist => (
            <Pressable
              key={checklist.id}
              onPress={() => selectChecklist(checklist.id)}
              className="bg-white rounded-xl p-4 border border-gray-200 active:bg-gray-50"
            >
              <Text className="text-lg font-semibold text-gray-900 mb-1">{checklist.name}</Text>
              {checklist.description && (
                <Text className="text-gray-600">{checklist.description}</Text>
              )}
            </Pressable>
          ))}
        </View>

        {checklists.length === 0 && (
          <View className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <Text className="text-yellow-800 font-medium">No checklists available</Text>
            <Text className="text-yellow-700 mt-1">Contact your admin to set up checklists</Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}