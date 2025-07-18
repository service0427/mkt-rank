import express from 'express';
import { ApiKeyService } from '../services/api-key.service';
import { logger } from '../utils/logger';

const router = express.Router();
const apiKeyService = ApiKeyService.getInstance();

// Get all API keys
router.get('/', async (req, res) => {
  try {
    const { provider } = req.query;
    const keys = await apiKeyService.getAllApiKeys(provider as string);
    
    // Hide full secrets for security
    const safeKeys = keys.map(key => ({
      ...key,
      client_secret: key.client_secret.substring(0, 4) + '****'
    }));
    
    res.json({
      success: true,
      data: safeKeys
    });
  } catch (error) {
    logger.error('Failed to get API keys:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create new API key
router.post('/', async (req, res) => {
  try {
    const { provider, client_id, client_secret, description } = req.body;
    
    if (!provider || !client_id || !client_secret) {
      res.status(400).json({
        success: false,
        error: 'Provider, client_id, and client_secret are required'
      });
      return;
    }
    
    // 저장 전에 API 키 검증
    const isValid = await apiKeyService.validateApiKey(provider, client_id, client_secret);
    
    if (!isValid) {
      res.status(400).json({
        success: false,
        error: 'API 키가 유효하지 않습니다. 키를 확인해주세요.'
      });
      return;
    }
    
    const newKey = await apiKeyService.createApiKey({
      provider,
      client_id,
      client_secret,
      description
    });
    
    res.json({
      success: true,
      data: {
        ...newKey,
        client_secret: newKey.client_secret.substring(0, 4) + '****'
      }
    });
  } catch (error) {
    logger.error('Failed to create API key:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update API key
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { client_id, client_secret, description, is_active } = req.body;
    
    const updatedKey = await apiKeyService.updateApiKey(id, {
      client_id,
      client_secret,
      description,
      is_active
    });
    
    res.json({
      success: true,
      data: {
        ...updatedKey,
        client_secret: updatedKey.client_secret.substring(0, 4) + '****'
      }
    });
  } catch (error) {
    logger.error('Failed to update API key:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete API key
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await apiKeyService.deleteApiKey(id);
    
    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete API key:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Validate API key
router.post('/validate', async (req, res) => {
  try {
    const { provider, client_id, client_secret } = req.body;
    
    if (!provider || !client_id || !client_secret) {
      res.status(400).json({
        success: false,
        error: 'Provider, client_id, and client_secret are required'
      });
      return;
    }
    
    const isValid = await apiKeyService.validateApiKey(provider, client_id, client_secret);
    
    res.json({
      success: true,
      valid: isValid
    });
  } catch (error) {
    logger.error('Failed to validate API key:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Toggle API key active status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get current key
    const keys = await apiKeyService.getAllApiKeys();
    const key = keys.find(k => k.id === id);
    
    if (!key) {
      res.status(404).json({
        success: false,
        error: 'API key not found'
      });
      return;
    }
    
    // Toggle active status
    const updatedKey = await apiKeyService.updateApiKey(id, {
      is_active: !key.is_active
    });
    
    res.json({
      success: true,
      data: {
        ...updatedKey,
        client_secret: updatedKey.client_secret.substring(0, 4) + '****'
      }
    });
  } catch (error) {
    logger.error('Failed to toggle API key:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;