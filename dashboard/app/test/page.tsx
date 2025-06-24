'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TestPage() {
  const [status, setStatus] = useState<any>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    testConnections()
  }, [])

  const testConnections = async () => {
    const results: any = {}
    
    // 1. 환경 변수 확인
    results.env = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET',
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    }

    // 2. Supabase 연결 테스트
    try {
      const { data, error } = await supabase
        .from('search_keywords')
        .select('count')
        .limit(1)
      
      results.supabase = {
        connected: !error,
        error: error?.message,
        data: data
      }
    } catch (e: any) {
      results.supabase = {
        connected: false,
        error: e.message
      }
    }

    // 3. 테이블 목록 가져오기
    try {
      const { data: tables } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .like('table_name', '%keyword%')
      
      results.tables = tables || []
    } catch (e) {
      results.tables = []
    }

    // 4. search_keywords 테이블 데이터 확인
    try {
      const { data, error, count } = await supabase
        .from('search_keywords')
        .select('*', { count: 'exact', head: false })
        .limit(5)
      
      results.keywords = {
        count: count || 0,
        sample: data || [],
        error: error?.message
      }
    } catch (e: any) {
      results.keywords = {
        count: 0,
        sample: [],
        error: e.message
      }
    }

    // 5. 로컬 PostgreSQL 연결 테스트 (백엔드에서 사용)
    results.localPostgres = {
      info: '백엔드 서버가 로컬 PostgreSQL을 사용합니다',
      note: '프론트엔드는 Supabase에 직접 연결되므로 별도 API가 필요없습니다'
    }

    setStatus(results)
    setLoading(false)
  }

  if (loading) {
    return <div className="p-8 bg-gray-50 min-h-screen text-gray-900">테스트 중...</div>
  }

  return (
    <div className="p-8 max-w-4xl mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">연결 상태 테스트</h1>
      
      <div className="space-y-6">
        {/* 환경 변수 */}
        <div className="bg-white p-4 rounded shadow border border-gray-200">
          <h2 className="font-bold mb-2 text-gray-900">1. 환경 변수</h2>
          <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto text-gray-800">
            {JSON.stringify(status.env, null, 2)}
          </pre>
        </div>

        {/* Supabase 연결 */}
        <div className="bg-white p-4 rounded shadow border border-gray-200">
          <h2 className="font-bold mb-2 text-gray-900">2. Supabase 연결</h2>
          <div className={`text-sm ${status.supabase?.connected ? 'text-green-600' : 'text-red-600'}`}>
            상태: {status.supabase?.connected ? '✅ 연결됨' : '❌ 연결 실패'}
          </div>
          {status.supabase?.error && (
            <div className="text-red-600 text-sm mt-2">
              에러: {status.supabase.error}
            </div>
          )}
        </div>

        {/* 키워드 데이터 */}
        <div className="bg-white p-4 rounded shadow border border-gray-200">
          <h2 className="font-bold mb-2 text-gray-900">3. search_keywords 테이블</h2>
          <div className="text-sm text-gray-800">
            총 키워드 수: {status.keywords?.count || 0}개
          </div>
          {status.keywords?.error && (
            <div className="text-red-600 text-sm mt-2">
              에러: {status.keywords.error}
            </div>
          )}
          {status.keywords?.sample?.length > 0 && (
            <div className="mt-2">
              <div className="text-sm font-medium text-gray-900">샘플 데이터:</div>
              <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto text-gray-800">
                {JSON.stringify(status.keywords.sample, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* 시스템 구조 설명 */}
        <div className="bg-white p-4 rounded shadow border border-gray-200">
          <h2 className="font-bold mb-2 text-gray-900">4. 시스템 구조</h2>
          <div className="text-sm text-gray-800 space-y-2">
            <div>📊 <strong>프론트엔드 (현재 페이지)</strong>: Supabase에 직접 연결</div>
            <div>🔄 <strong>백엔드 스케줄러</strong>: 로컬 PostgreSQL → Supabase 동기화</div>
            <div>💾 <strong>데이터 흐름</strong>: 네이버 API → 로컬 DB → Supabase → 대시보드</div>
          </div>
          {status.localPostgres && (
            <div className="mt-3 p-2 bg-blue-50 rounded text-sm text-blue-800">
              {status.localPostgres.info}
            </div>
          )}
        </div>

        {/* 전체 상태 */}
        <div className="bg-white p-4 rounded shadow border border-gray-200">
          <h2 className="font-bold mb-2 text-gray-900">5. 전체 상태 (Raw)</h2>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto text-gray-800">
            {JSON.stringify(status, null, 2)}
          </pre>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={testConnections}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          다시 테스트
        </button>
      </div>
    </div>
  )
}