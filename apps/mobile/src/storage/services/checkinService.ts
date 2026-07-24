import { createCheckin } from '../repositories/checkinRepository';
import { trackingHypothesis } from '../repositories/hypothesisRepository';
export async function createManualDemoCheckin() { const hypothesis = await trackingHypothesis(); return createCheckin({ kind: 'manual_demo', hypothesisId: hypothesis?.id ?? null }); }
