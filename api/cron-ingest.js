/**
 * Vercel Cron handler to trigger daily RAG index updates at 10:00 AM IST (04:30 AM UTC).
 * It sends a request to the Vercel Deploy Hook, triggering a rebuild.
 * During the rebuild, the build script crawls the AMC pages and regenerates the vector index.
 */

export default async function handler(req, res) {
  // Validate request is triggered by Vercel Cron
  // Vercel Cron sends a Bearer token in the Authorization header
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // Only validate if CRON_SECRET is configured in the environment
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized. Invalid Cron Secret.' });
  }

  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!deployHookUrl) {
    console.warn('[CRON] VERCEL_DEPLOY_HOOK_URL environment variable is missing.');
    return res.status(500).json({ 
      error: 'VERCEL_DEPLOY_HOOK_URL environment variable is not configured.' 
    });
  }

  try {
    console.log('[CRON] Triggering rebuild via Vercel Deploy Hook...');
    
    const response = await fetch(deployHookUrl, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Deploy Hook returned status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[CRON] Deploy Hook triggered successfully. Job ID:', data.job?.id);

    return res.status(200).json({
      success: true,
      message: 'Daily rebuild and ingest pipeline triggered successfully.',
      jobId: data.job?.id
    });

  } catch (error) {
    console.error('[CRON] Error triggering Deploy Hook:', error);
    return res.status(500).json({ 
      error: 'Failed to trigger Vercel Deploy Hook rebuild.',
      details: error.message 
    });
  }
}
