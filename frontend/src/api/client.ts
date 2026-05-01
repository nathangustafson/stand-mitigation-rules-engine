import axios, { AxiosError } from 'axios'

export interface Property {
  id: number
  street: string
  unit?: string | null
  city: string
  state: string
  zip: string
  nickname?: string | null
  created_at: string
  updated_at: string
}

/** Property row enriched with the outstanding-evaluation summary (returned
 *  by GET /api/properties). The detail endpoint still returns plain Property. */
export interface PropertyListItem extends Property {
  observation_count: number
  latest_observation_at: string | null
  outstanding_vulnerability_count: number
  outstanding_full_mitigation_count: number
  outstanding_bridge_mitigation_count: number
}

export interface PropertyCreate {
  street: string
  unit?: string | null
  city: string
  state: string
  zip: string
  nickname?: string | null
}

export type PropertyUpdate = Partial<PropertyCreate>

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

function describeError(error: unknown): Error {
  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail ?? error.message
    return new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return error instanceof Error ? error : new Error(String(error))
}

export async function listProperties(): Promise<PropertyListItem[]> {
  try {
    const { data } = await api.get<PropertyListItem[]>('/properties')
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function getProperty(id: number): Promise<Property> {
  try {
    const { data } = await api.get<Property>(`/properties/${id}`)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function createProperty(payload: PropertyCreate): Promise<Property> {
  try {
    const { data } = await api.post<Property>('/properties', payload)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function updateProperty(id: number, payload: PropertyUpdate): Promise<Property> {
  try {
    const { data } = await api.patch<Property>(`/properties/${id}`, payload)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function deleteProperty(id: number): Promise<void> {
  try {
    await api.delete(`/properties/${id}`)
  } catch (error) {
    throw describeError(error)
  }
}

export type ObservationFieldType = 'enum' | 'number' | 'boolean' | 'string' | 'list_of_object'

export interface ObservationFieldChild {
  key: string
  label: string
  type: ObservationFieldType
  allowed_values?: string[] | null
  /** Optional display labels for enum codes (e.g. {"ember_resistant": "Ember-resistant"}).
   *  Falls back to the raw underscored code when missing. */
  value_labels?: Record<string, string> | null
  unit?: string | null
}

export interface ObservationField {
  id: number
  key: string
  label: string
  type: ObservationFieldType
  allowed_values?: string[] | null
  /** Optional display labels for enum codes (e.g. {"ember_resistant": "Ember-resistant"}).
   *  Falls back to the raw underscored code when missing. */
  value_labels?: Record<string, string> | null
  unit?: string | null
  group_label?: string | null
  sort_order: number
  item_schema?: { fields: ObservationFieldChild[] } | null
  deprecated_at?: string | null
}

export interface Observation {
  id: number
  property_id: number
  captured_at: string
  /** Raw values captured at this observation. Possibly sparse — only the
   *  fields that the underwriter changed since the previous observation. */
  values: Record<string, unknown>
  /** Effective values after merging this observation onto every predecessor.
   *  Represents the property's actual state as of `captured_at`. */
  effective_values: Record<string, unknown>
}

export async function listObservationFields(): Promise<ObservationField[]> {
  try {
    const { data } = await api.get<ObservationField[]>('/observation-fields')
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function listObservations(propertyId: number): Promise<Observation[]> {
  try {
    const { data } = await api.get<Observation[]>(`/properties/${propertyId}/observations`)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function createObservation(
  propertyId: number,
  values: Record<string, unknown>,
  capturedAt?: string,
): Promise<Observation> {
  try {
    const body: Record<string, unknown> = { values }
    if (capturedAt) body.captured_at = capturedAt
    const { data } = await api.post<Observation>(
      `/properties/${propertyId}/observations`,
      body,
    )
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function updateObservation(
  propertyId: number,
  observationId: number,
  values: Record<string, unknown>,
  capturedAt?: string,
): Promise<Observation> {
  try {
    const body: Record<string, unknown> = { values }
    if (capturedAt) body.captured_at = capturedAt
    const { data } = await api.patch<Observation>(
      `/properties/${propertyId}/observations/${observationId}`,
      body,
    )
    return data
  } catch (error) {
    throw describeError(error)
  }
}

// ---------------------------------------------------------------------------
// Observation field registry CRUD (Applied Sciences)
// ---------------------------------------------------------------------------

export interface ObservationFieldCreate {
  key: string
  label: string
  type: ObservationFieldType
  allowed_values?: string[] | null
  value_labels?: Record<string, string> | null
  unit?: string | null
  group_label?: string | null
  sort_order?: number
  item_schema?: { fields: ObservationFieldChild[] } | null
}

export type ObservationFieldUpdate = Partial<Omit<ObservationFieldCreate, 'key'>> & {
  deprecated?: boolean
}

export async function createObservationField(
  payload: ObservationFieldCreate,
): Promise<ObservationField> {
  try {
    const { data } = await api.post<ObservationField>('/observation-fields', payload)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function updateObservationField(
  id: number,
  payload: ObservationFieldUpdate,
): Promise<ObservationField> {
  try {
    const { data } = await api.patch<ObservationField>(`/observation-fields/${id}`, payload)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function deleteObservationField(id: number): Promise<void> {
  try {
    await api.delete(`/observation-fields/${id}`)
  } catch (error) {
    throw describeError(error)
  }
}

// ---------------------------------------------------------------------------
// Rules CRUD (Applied Sciences)
// ---------------------------------------------------------------------------

export type RuleType = 'boolean' | 'logical' | 'parameterized'
export type MitigationTier = 'full' | 'bridge'

export interface Mitigation {
  id: number
  rule_id: number
  tier: MitigationTier
  name: string
  description: string
  effect?: string | null
  sort_order: number
}

export interface MitigationInput {
  tier: MitigationTier
  name: string
  description: string
  effect?: string | null
  sort_order?: number
}

export type Severity = 'low' | 'medium' | 'high'

export interface Rule {
  id: number
  name: string
  description: string
  type: RuleType
  body: Record<string, unknown>
  enabled: boolean
  priority: number
  severity: Severity
  created_at: string
  updated_at: string
  mitigations: Mitigation[]
}

export interface RuleCreate {
  name: string
  description: string
  body: Record<string, unknown>
  enabled?: boolean
  priority?: number
  severity?: Severity
  mitigations?: MitigationInput[]
}

export type RuleUpdate = Partial<RuleCreate>

export async function listRules(): Promise<Rule[]> {
  try {
    const { data } = await api.get<Rule[]>('/rules')
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function getRule(id: number): Promise<Rule> {
  try {
    const { data } = await api.get<Rule>(`/rules/${id}`)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function createRule(payload: RuleCreate): Promise<Rule> {
  try {
    const { data } = await api.post<Rule>('/rules', payload)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function updateRule(id: number, payload: RuleUpdate): Promise<Rule> {
  try {
    const { data } = await api.patch<Rule>(`/rules/${id}`, payload)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function deleteRule(id: number): Promise<void> {
  try {
    await api.delete(`/rules/${id}`)
  } catch (error) {
    throw describeError(error)
  }
}

// Per-mitigation endpoints — for the rule detail page where each mitigation
// has its own editor and saves independently.
export async function addMitigation(
  ruleId: number,
  payload: MitigationInput,
): Promise<Mitigation> {
  try {
    const { data } = await api.post<Mitigation>(`/rules/${ruleId}/mitigations`, payload)
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function updateMitigation(
  ruleId: number,
  mitigationId: number,
  payload: MitigationInput,
): Promise<Mitigation> {
  try {
    const { data } = await api.patch<Mitigation>(
      `/rules/${ruleId}/mitigations/${mitigationId}`,
      payload,
    )
    return data
  } catch (error) {
    throw describeError(error)
  }
}

export async function deleteMitigation(ruleId: number, mitigationId: number): Promise<void> {
  try {
    await api.delete(`/rules/${ruleId}/mitigations/${mitigationId}`)
  } catch (error) {
    throw describeError(error)
  }
}

// Rule testing — evaluate a single rule against a values dict.
export interface RuleTestResult {
  rule_id: number
  rule_name: string
  rule_type: RuleType
  holds: boolean
  detail?: string | null
  full_mitigations: Mitigation[]
  bridge_mitigations: Mitigation[]
}

export async function testRule(
  ruleId: number,
  values: Record<string, unknown>,
): Promise<RuleTestResult> {
  try {
    const { data } = await api.post<RuleTestResult>(`/rules/${ruleId}/test`, { values })
    return data
  } catch (error) {
    throw describeError(error)
  }
}

// ---------------------------------------------------------------------------
// Evaluation (Underwriter)
// ---------------------------------------------------------------------------

export interface Vulnerability {
  rule_id: number
  rule_name: string
  description: string
  severity: Severity
  detail?: string | null
}

export interface EvaluationResult {
  observation_id: number
  property_id: number
  evaluated_rule_count: number
  vulnerabilities: Vulnerability[]
  full_mitigations: Mitigation[]
  bridge_mitigations: Mitigation[]
  bridge_mitigation_count: number
  explanation: string
}

export async function evaluateObservation(
  propertyId: number,
  observationId: number,
  options?: { asOf?: string | null },
): Promise<EvaluationResult> {
  try {
    const { data } = await api.post<EvaluationResult>(
      `/properties/${propertyId}/observations/${observationId}/evaluate`,
      undefined,
      { params: options?.asOf ? { as_of: options.asOf } : undefined },
    )
    return data
  } catch (error) {
    throw describeError(error)
  }
}

// ---------------------------------------------------------------------------
// Demo seed (POC convenience)
// ---------------------------------------------------------------------------

export interface DemoSeedResult {
  properties_created: number
  observations_created: number
  properties_skipped: number
}

export async function seedDemoData(): Promise<DemoSeedResult> {
  try {
    const { data } = await api.post<DemoSeedResult>('/demo/seed')
    return data
  } catch (error) {
    throw describeError(error)
  }
}
