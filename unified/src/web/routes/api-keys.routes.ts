import { Router, Request, Response } from 'express';
import { query } from '../../db/postgres';
import crypto from 'crypto';
import axios from 'axios';

const router = Router();

// 암호화 키 (환경변수에서 가져오거나 기본값 사용)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-this';

// 간단한 암호화/복호화 함수
function encrypt(text: string): string {
  const algorithm = 'aes-256-ctr';
  const cipher = crypto.createCipheriv(algorithm, crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32), Buffer.alloc(16, 0));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(text: string): string {
  try {
    const algorithm = 'aes-256-ctr';
    const decipher = crypto.createDecipheriv(algorithm, crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32), Buffer.alloc(16, 0));
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
}

// API 키 목록 조회
router.get('/', async (_req: Request, res: Response) => {
  try {
    const keys = await query(`
      SELECT 
        key_id,
        provider,
        client_id,
        description,
        is_active,
        created_at,
        updated_at
      FROM unified_api_keys
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: keys.map(key => ({
        ...key,
        id: key.key_id
      }))
    });
  } catch (error) {
    console.error('API keys fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'API 키 목록을 불러올 수 없습니다'
    });
  }
});

// API 키 추가
router.post('/', async (req: Request, res: Response) => {
  const { provider, client_id, client_secret, description } = req.body;

  if (!provider || !client_id || !client_secret) {
    res.status(400).json({
      success: false,
      error: '필수 필드가 누락되었습니다'
    });
    return;
  }

  try {
    // 중복 체크
    const existing = await query(`
      SELECT key_id FROM unified_api_keys 
      WHERE provider = $1 AND client_id = $2 AND deleted_at IS NULL
    `, [provider, client_id]);

    if (existing.length > 0) {
      res.status(400).json({
        success: false,
        error: '이미 등록된 API 키입니다'
      });
      return;
    }

    // 암호화하여 저장
    const encryptedSecret = encrypt(client_secret);

    const [newKey] = await query(`
      INSERT INTO unified_api_keys (
        provider, client_id, client_secret, description, is_active
      ) VALUES ($1, $2, $3, $4, true)
      RETURNING key_id, provider, client_id, description, is_active, created_at
    `, [provider, client_id, encryptedSecret, description]);

    res.json({
      success: true,
      data: {
        ...newKey,
        id: newKey.key_id
      }
    });
  } catch (error) {
    console.error('API key creation error:', error);
    res.status(500).json({
      success: false,
      error: 'API 키 생성에 실패했습니다'
    });
  }
});

// API 키 검증
router.post('/validate', async (req: Request, res: Response) => {
  const { provider, client_id, client_secret } = req.body;

  if (!provider || !client_id || !client_secret) {
    res.status(400).json({
      success: false,
      error: '필수 필드가 누락되었습니다'
    });
    return;
  }

  try {
    let isValid = false;
    let error = '';

    if (provider === 'naver_shopping') {
      // 네이버 API 테스트
      try {
        const response = await axios.get('https://openapi.naver.com/v1/search/shop.json', {
          params: { query: '테스트', display: 1 },
          headers: {
            'X-Naver-Client-Id': client_id,
            'X-Naver-Client-Secret': client_secret
          }
        });
        isValid = response.status === 200;
      } catch (err: any) {
        error = err.response?.data?.errorMessage || err.message;
      }
    } else if (provider === 'coupang') {
      // 쿠팡 API는 실제 API가 없으므로 형식만 검증
      isValid = client_id.length > 0 && client_secret.length > 0;
    }

    res.json({
      success: isValid,
      error: isValid ? null : error || 'API 키 검증 실패'
    });
  } catch (error) {
    console.error('API validation error:', error);
    res.status(500).json({
      success: false,
      error: '검증 중 오류가 발생했습니다'
    });
  }
});

// 특정 API 키 검증
router.post('/:id/validate', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [key] = await query(`
      SELECT provider, client_id, client_secret
      FROM unified_api_keys
      WHERE key_id = $1 AND deleted_at IS NULL
    `, [id]);

    if (!key) {
      res.status(404).json({
        success: false,
        error: 'API 키를 찾을 수 없습니다'
      });
      return;
    }

    const decryptedSecret = decrypt(key.client_secret);
    
    // 위의 검증 로직 재사용
    const validateResponse = await axios.post('http://localhost:4000/api/keys/validate', {
      provider: key.provider,
      client_id: key.client_id,
      client_secret: decryptedSecret
    });

    res.json(validateResponse.data);
  } catch (error) {
    console.error('Key validation error:', error);
    res.status(500).json({
      success: false,
      error: '검증 중 오류가 발생했습니다'
    });
  }
});

// API 키 삭제 (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query(`
      UPDATE unified_api_keys
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE key_id = $1 AND deleted_at IS NULL
      RETURNING key_id
    `, [id]);

    if (result.length === 0) {
      res.status(404).json({
        success: false,
        error: 'API 키를 찾을 수 없습니다'
      });
      return;
    }

    res.json({
      success: true,
      message: 'API 키가 삭제되었습니다'
    });
  } catch (error) {
    console.error('API key deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'API 키 삭제에 실패했습니다'
    });
  }
});

// 활성 API 키 가져오기 (내부 사용)
export async function getActiveApiKey(provider: string): Promise<{ client_id: string; client_secret: string } | null> {
  try {
    const [key] = await query(`
      SELECT client_id, client_secret
      FROM unified_api_keys
      WHERE provider = $1 AND is_active = true AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `, [provider]);

    if (key) {
      return {
        client_id: key.client_id,
        client_secret: decrypt(key.client_secret)
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching API key:', error);
    return null;
  }
}

export default router;