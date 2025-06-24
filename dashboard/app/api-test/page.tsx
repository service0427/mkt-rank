'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function ApiTestPage() {
  const [keyword, setKeyword] = useState('노트북')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string>('')

  const testNaverAPI = async () => {
    setLoading(true)
    setError('')
    setResults(null)

    try {
      const response = await fetch(`http://localhost:3001/api/search?keyword=${encodeURIComponent(keyword)}`)
      
      if (!response.ok) {
        throw new Error(`API 요청 실패: ${response.status}`)
      }

      const data = await response.json()
      setResults(data)
    } catch (err: any) {
      setError(err.message || '알 수 없는 오류가 발생했습니다')
      
      if (err.message.includes('fetch')) {
        setError('백엔드 API 서버가 실행되지 않았습니다. npm run api 명령을 실행해주세요.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">🛍️ 네이버 쇼핑 API 테스트</h1>

        {/* 검색 폼 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                검색 키워드
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && testNaverAPI()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                placeholder="검색할 키워드 입력..."
              />
            </div>
            <button
              onClick={testNaverAPI}
              disabled={loading || !keyword}
              className="px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  검색 중...
                </span>
              ) : '검색'}
            </button>
          </div>
        </div>

        {/* API 키 통계 */}
        {results?.apiKeyStats && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
            <h3 className="font-bold text-green-900 mb-3">🔑 API 키 사용 현황</h3>
            <div className="grid grid-cols-3 gap-4">
              {results.apiKeyStats.map((stat: any) => (
                <div key={stat.index} className="bg-white p-3 rounded border border-green-300">
                  <p className="text-sm font-medium text-gray-700">API 키 #{stat.index + 1}</p>
                  <p className="text-2xl font-bold text-green-600">{stat.usageCount}</p>
                  <p className="text-xs text-gray-500">사용 횟수</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 에러 표시 */}
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-6">
            <h3 className="font-bold text-red-900 mb-1">❌ 오류 발생</h3>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* 결과 표시 */}
        {results && (
          <div className="space-y-6">
            {/* 요약 정보 */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4 text-lg">📊 검색 결과 요약</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-600 font-medium">총 검색 결과</p>
                  <p className="text-2xl font-bold text-blue-900">{results.totalCount?.toLocaleString()}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-purple-600 font-medium">현재 페이지</p>
                  <p className="text-2xl font-bold text-purple-900">{results.results?.length || 0}개</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-green-600 font-medium">검색 시간</p>
                  <p className="text-2xl font-bold text-green-900">{results.searchTime}ms</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-orange-600 font-medium">검색 키워드</p>
                  <p className="text-xl font-bold text-orange-900 truncate">{results.keyword}</p>
                </div>
              </div>
            </div>

            {/* 상품 목록 */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-6 text-lg">🛒 상품 목록</h3>
              <div className="space-y-4">
                {results.results?.map((item: any, index: number) => (
                  <div key={item.productId} className="border-b border-gray-100 pb-4 last:border-0 hover:bg-gray-50 transition-colors rounded-lg p-4">
                    <div className="flex gap-4">
                      {/* 상품 이미지 */}
                      {item.image && (
                        <div className="flex-shrink-0">
                          <img 
                            src={item.image} 
                            alt={item.title}
                            className="w-28 h-28 object-cover rounded-lg border border-gray-200"
                          />
                        </div>
                      )}
                      
                      {/* 상품 정보 */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 mb-2">
                              <span className="text-blue-600 font-bold mr-2">{index + 1}.</span>
                              <span dangerouslySetInnerHTML={{ __html: item.title }} />
                            </h4>
                            
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {item.mallName}
                              </span>
                              {item.brand && (
                                <span className="text-sm text-gray-600">
                                  <span className="font-medium">브랜드:</span> {item.brand}
                                </span>
                              )}
                              {item.maker && item.maker !== item.brand && (
                                <span className="text-sm text-gray-500">
                                  <span className="font-medium">제조사:</span> {item.maker}
                                </span>
                              )}
                            </div>
                            
                            <p className="text-xs text-gray-500 mb-3">
                              📂 {item.category1} › {item.category2}
                              {item.category3 && ` › ${item.category3}`}
                              {item.category4 && ` › ${item.category4}`}
                            </p>
                            
                            <div className="flex items-center gap-4">
                              <a 
                                href={item.link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                              >
                                상품 보러가기 →
                              </a>
                              <span className="text-xs text-gray-400">
                                ID: {item.productId}
                              </span>
                              <span className="text-xs text-gray-400">
                                타입: {item.productType === '1' ? '가격비교' : item.productType === '2' ? '가격비교불가' : '일반'}
                              </span>
                            </div>
                          </div>
                          
                          {/* 가격 정보 */}
                          <div className="text-right flex-shrink-0">
                            <p className="text-2xl font-bold text-blue-600">
                              ₩{parseInt(item.lprice).toLocaleString()}
                            </p>
                            {item.hprice && parseInt(item.hprice) > parseInt(item.lprice) && (
                              <>
                                <p className="text-sm text-gray-500 line-through">
                                  ₩{parseInt(item.hprice).toLocaleString()}
                                </p>
                                <p className="text-sm text-green-600 font-medium">
                                  {Math.round((1 - parseInt(item.lprice) / parseInt(item.hprice)) * 100)}% 할인
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw 데이터 */}
            <details className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <summary className="font-bold text-gray-900 cursor-pointer hover:text-blue-600 text-lg">
                💾 Raw API Response (클릭하여 펼치기)
              </summary>
              <pre className="text-xs bg-gray-900 text-gray-100 p-6 rounded-lg overflow-auto mt-4 max-h-96">
                {JSON.stringify(results, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}