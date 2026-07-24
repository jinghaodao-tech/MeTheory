import type { ExternalParameterMapping, ExternalSourceRecord, SourceAdapter, SourceFetchInput, SourceFetchResult, SourcePermissionStatus } from './sourceAdapters.ts';
export type ProviderBridge = { getPermissionStatus(): Promise<SourcePermissionStatus>; requestPermission?(): Promise<SourcePermissionStatus>; fetch(input: SourceFetchInput): Promise<ExternalSourceRecord[]> };
export class CalendarAdapter implements SourceAdapter {
  readonly providerKey = 'calendar' as const;
  readonly capabilities = ['read_events', 'read_current_state'] as const;
  private readonly bridge: ProviderBridge;
  constructor(bridge: ProviderBridge) { this.bridge = bridge; }
  getPermissionStatus() { return this.bridge.getPermissionStatus(); }
  requestPermission() { return this.bridge.requestPermission ? this.bridge.requestPermission() : this.bridge.getPermissionStatus(); }
  async listSupportedParameterMappings(): Promise<ExternalParameterMapping[]> { return [{ id: 'calendar_event_count', providerKey: this.providerKey, externalField: 'eventCount', parameterId: 'schedule_density', transformation: { type: 'identity' }, certainty: 'medium', transformationVersion: 'calendar-v1', isActive: true }, { id: 'calendar_minutes_until_next', providerKey: this.providerKey, externalField: 'minutesUntilNextEvent', parameterId: 'minutes_until_next_event', transformation: { type: 'identity' }, certainty: 'medium', transformationVersion: 'calendar-v1', isActive: true }]; }
  async fetch(input: SourceFetchInput): Promise<SourceFetchResult> { return { records: await this.bridge.fetch(input), fetchedAt: new Date().toISOString() }; }
}
export class HealthAdapter implements SourceAdapter {
  readonly providerKey = 'health' as const;
  readonly capabilities = ['read_samples', 'read_daily_summary'] as const;
  private readonly bridge: ProviderBridge;
  constructor(bridge: ProviderBridge) { this.bridge = bridge; }
  getPermissionStatus() { return this.bridge.getPermissionStatus(); }
  requestPermission() { return this.bridge.requestPermission ? this.bridge.requestPermission() : this.bridge.getPermissionStatus(); }
  async listSupportedParameterMappings(): Promise<ExternalParameterMapping[]> { return [{ id: 'health_sleep_duration', providerKey: this.providerKey, externalField: 'sleepDurationMinutes', parameterId: 'sleep_duration_minutes', transformation: { type: 'identity' }, certainty: 'medium', transformationVersion: 'health-v1', isActive: true }, { id: 'health_heart_rate', providerKey: this.providerKey, externalField: 'heartRate', parameterId: 'heart_rate', transformation: { type: 'identity' }, certainty: 'low', transformationVersion: 'health-v1', isActive: true }]; }
  async fetch(input: SourceFetchInput): Promise<SourceFetchResult> { return { records: await this.bridge.fetch(input), fetchedAt: new Date().toISOString() }; }
}
