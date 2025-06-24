'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, SearchKeyword, KeywordStatistics } from '@/lib/supabase'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

export default function Home() {
  const [keywords, setKeywords] = useState<SearchKeyword[]>([])
  const [statistics, setStatistics] = useState<Record<string, KeywordStatistics>>({})
  const [loading, setLoading] = useState(true)
  const [newKeyword, setNewKeyword] = useState('')

  useEffect(() => {
    fetchKeywords()
  }, [])

  const fetchKeywords = async () => {
    setLoading(true)
    try {
      console.log('Fetching keywords from Supabase...')
      console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
      
      // Fetch keywords from search_keywords table
      const { data: keywordsData, error: keywordsError } = await supabase
        .from('search_keywords')
        .select('*')
        .order('created_at', { ascending: false })

      console.log('Keywords response:', { data: keywordsData, error: keywordsError })

      if (keywordsError) throw keywordsError
      setKeywords(keywordsData || [])

      // Fetch statistics for each keyword
      if (keywordsData && keywordsData.length > 0) {
        const keywordIds = keywordsData.map(k => k.id)
        const { data: statsData, error: statsError } = await supabase
          .from('keyword_statistics')
          .select('*')
          .in('keyword_id', keywordIds)

        if (!statsError && statsData) {
          const statsMap: Record<string, KeywordStatistics> = {}
          statsData.forEach(stat => {
            statsMap[stat.keyword_id] = stat
          })
          setStatistics(statsMap)
        }
      }
    } catch (error) {
      console.error('Error fetching keywords:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleKeywordActive = async (keyword: SearchKeyword) => {
    try {
      const { error } = await supabase
        .from('search_keywords')
        .update({ is_active: !keyword.is_active })
        .eq('id', keyword.id)

      if (error) throw error
      await fetchKeywords()
    } catch (error) {
      console.error('Error updating keyword:', error)
    }
  }

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyword.trim()) return

    try {
      const { error } = await supabase
        .from('search_keywords')
        .insert([{ 
          keyword: newKeyword.trim(),
          is_active: true,
          pc_count: 0,
          mobile_count: 0,
          total_count: 0,
          pc_ratio: 0,
          mobile_ratio: 0
        }])

      if (error) throw error
      setNewKeyword('')
      await fetchKeywords()
    } catch (error) {
      console.error('Error adding keyword:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">쇼핑 키워드 랭킹 대시보드</h1>

        {/* Add Keyword Form */}
        <form onSubmit={addKeyword} className="mb-8 bg-white p-4 rounded-lg shadow">
          <div className="flex gap-4">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="새 키워드 추가..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              추가
            </button>
          </div>
        </form>

        {/* Keywords Table */}
        {loading ? (
          <div className="text-center py-8">로딩 중...</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    키워드
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    월간 검색량
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    PC/모바일
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상품 수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    평균 가격
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    마지막 수집
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {keywords.map((keyword) => {
                  const stats = statistics[keyword.id]
                  return (
                    <tr key={keyword.id} className={!keyword.is_active ? 'opacity-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/keyword/${keyword.id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {keyword.keyword}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {keyword.total_count.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div>PC: {keyword.pc_ratio}%</div>
                        <div>모바일: {keyword.mobile_ratio}%</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {stats?.total_products || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {stats?.avg_price ? `₩${stats.avg_price.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {keyword.last_collected_at
                          ? format(new Date(keyword.last_collected_at), 'MM/dd HH:mm', { locale: ko })
                          : '수집 전'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            keyword.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {keyword.is_active ? '활성' : '비활성'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => toggleKeywordActive(keyword)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          {keyword.is_active ? '비활성화' : '활성화'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}