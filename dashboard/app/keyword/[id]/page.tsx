'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase, SearchKeyword, ShoppingRankingLatest } from '@/lib/supabase'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function KeywordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const keywordId = params.id as string
  
  const [keyword, setKeyword] = useState<SearchKeyword | null>(null)
  const [rankings, setRankings] = useState<ShoppingRankingLatest[]>([])
  const [hourlyData, setHourlyData] = useState<any[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'current' | 'trend'>('current')

  useEffect(() => {
    if (keywordId) {
      fetchKeywordData()
    }
  }, [keywordId])

  const fetchKeywordData = async () => {
    setLoading(true)
    try {
      // Fetch keyword info
      const { data: keywordData, error: keywordError } = await supabase
        .from('search_keywords')
        .select('*')
        .eq('id', keywordId)
        .single()

      if (keywordError) throw keywordError
      setKeyword(keywordData)

      // Fetch latest rankings
      const { data: rankingsData, error: rankingsError } = await supabase
        .from('shopping_rankings_latest')
        .select('*')
        .eq('keyword_id', keywordId)
        .order('rank', { ascending: true })
        .limit(100)

      if (rankingsError) throw rankingsError
      setRankings(rankingsData || [])

      // Select top 5 products for trend by default
      if (rankingsData && rankingsData.length > 0) {
        setSelectedProducts(rankingsData.slice(0, 5).map(r => r.product_id))
      }

      // Fetch hourly trend data
      await fetchHourlyTrend()
    } catch (error) {
      console.error('Error fetching keyword data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchHourlyTrend = async () => {
    try {
      const { data, error } = await supabase
        .from('shopping_rankings_hourly_summary')
        .select('*')
        .eq('keyword_id', keywordId)
        .gte('hour', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('hour', { ascending: true })

      if (error) throw error

      // Transform data for chart
      const chartData: any = {}
      data?.forEach(item => {
        const hour = format(new Date(item.hour), 'MM/dd HH:mm')
        if (!chartData[hour]) {
          chartData[hour] = { hour }
        }
        chartData[hour][item.product_id] = item.avg_rank
      })

      setHourlyData(Object.values(chartData))
    } catch (error) {
      console.error('Error fetching hourly trend:', error)
    }
  }

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId)
      } else if (prev.length < 10) {
        return [...prev, productId]
      }
      return prev
    })
  }

  const refreshData = async () => {
    // Trigger data collection for this keyword
    // This would call your backend API to collect fresh data
    console.log('Refreshing data for keyword:', keywordId)
    await fetchKeywordData()
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">로딩 중...</div>
  }

  if (!keyword) {
    return <div className="min-h-screen flex items-center justify-center">키워드를 찾을 수 없습니다.</div>
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">
            ← 목록으로
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{keyword.keyword}</h1>
              <p className="text-gray-600 mt-2">
                월간 검색량: {keyword.total_count.toLocaleString()} 
                (PC: {keyword.pc_ratio}% / 모바일: {keyword.mobile_ratio}%)
              </p>
              <p className="text-sm text-gray-500 mt-1">
                마지막 수집: {keyword.last_collected_at 
                  ? format(new Date(keyword.last_collected_at), 'yyyy년 MM월 dd일 HH:mm', { locale: ko })
                  : '수집 전'}
              </p>
            </div>
            <button
              onClick={refreshData}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              데이터 새로고침
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'current'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            현재 순위
          </button>
          <button
            onClick={() => setActiveTab('trend')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'trend'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            순위 추이
          </button>
        </div>

        {/* Content */}
        {activeTab === 'current' ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    순위
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상품
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    가격
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    쇼핑몰
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    카테고리
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    추이 보기
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rankings.map((ranking) => (
                  <tr key={ranking.product_id}>
                    <td className="px-6 py-4 whitespace-nowrap text-2xl font-bold text-gray-900">
                      {ranking.rank}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        {ranking.image && (
                          <img
                            src={ranking.image}
                            alt={ranking.title}
                            className="w-16 h-16 object-cover rounded"
                          />
                        )}
                        <div>
                          <a
                            href={ranking.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {ranking.title}
                          </a>
                          {ranking.brand && (
                            <p className="text-sm text-gray-500">브랜드: {ranking.brand}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-lg font-semibold">₩{ranking.lprice.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {ranking.mall_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {ranking.category1} &gt; {ranking.category2}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(ranking.product_id)}
                        onChange={() => toggleProductSelection(ranking.product_id)}
                        className="h-4 w-4 text-blue-600"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">순위 변화 추이 (최근 7일)</h2>
            <p className="text-sm text-gray-600 mb-4">
              최대 10개 상품까지 선택하여 비교할 수 있습니다. (현재 {selectedProducts.length}개 선택됨)
            </p>
            
            {hourlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis reversed domain={[1, 100]} />
                  <Tooltip />
                  <Legend />
                  {selectedProducts.map((productId, index) => {
                    const product = rankings.find(r => r.product_id === productId)
                    return (
                      <Line
                        key={productId}
                        type="monotone"
                        dataKey={productId}
                        name={product?.title.substring(0, 30) || productId}
                        stroke={`hsl(${index * 36}, 70%, 50%)`}
                        strokeWidth={2}
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-500 py-8">
                아직 추이 데이터가 없습니다. 데이터가 수집되면 여기에 표시됩니다.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}