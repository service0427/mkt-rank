// Web UI Routes
import { Router } from 'express';
import path from 'path';

const router = Router();

// Dashboard
router.get('/', async (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/dashboard.html'));
});

// Service Management
router.get('/services', async (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/services.html'));
});

// Keyword Search
router.get('/keywords', async (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/keywords.html'));
});

// Sync Management
router.get('/sync', async (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/sync.html'));
});

// Rankings Monitor
router.get('/rankings', async (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/rankings.html'));
});

// API Keys Management
router.get('/api-keys', async (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/api-keys.html'));
});

// System Settings
router.get('/settings', async (_req, res) => {
  res.sendFile(path.join(__dirname, '../views/settings.html'));
});

export { router as webRouter };