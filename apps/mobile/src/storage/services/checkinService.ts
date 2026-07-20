import { createCheckin } from '../repositories/checkinRepository';
import { trackingHypothesis } from '../repositories/hypothesisRepository';
export async function createManualDemoCheckin() { const hypothesis = await trackingHypothesis(); return createCheckin('manual_demo', hypothesis?.id ?? null); }
