import { addDoc, collection, doc, getDoc, getDocFromCache, getDocs, query, setDoc, Timestamp, updateDoc, writeBatch, type DocumentData, type QuerySnapshot } from 'firebase/firestore'
import { auth, firestore, isFirebaseConfigured, isFirebaseOfflineError } from '../firebase'
import { monthlyActivity, seedRequests, seedUnits } from '../seed'
import { memoryDonors } from './donors'
import type { BloodGroup, Donor, Request, Role, Unit } from '../types'

export type Infection = 'negative' | 'reactive' | 'pending'
export type Donation = { id: string; donorId: string; donorName: string; bagNumber: string; date: string; volumeMl: number; screening: { hb: number; weight: number; bp: string; pulse: number; temp: number }; status: 'testing' | 'quarantine' | 'available' }
export type BloodTest = { id: string; donationId: string; abo: string; rh: 'positive' | 'negative' | 'pending'; hiv: Infection; hbsag: Infection; hcv: Infection; syphilis: Infection; malaria: Infection; testedAt: string }
export type Camp = { id: string; name: string; place: string; date: string; targetDonors: number; collectedCount: number }
export type AuditEvent = { id: string; user: string; actor?: string; action: string; entity: string; entityId: string; timestamp: string; details: string }
export type Crossmatch = { id: string; requestId: string; unitId: string; result: 'compatible' | 'incompatible'; doneAt: string }
export type Discard = { id: string; unitId: string; reason: string; approvedBy: string; date: string }
export type Issue = { id: string; requestId: string; unitId: string; issuedTo: string; approvedBy: string; date: string; emergency: boolean }

type WorkflowData = { donors: Donor[]; donations: Donation[]; tests: BloodTest[]; units: Unit[]; requests: Request[]; camps: Camp[]; audit: AuditEvent[]; crossmatches: Crossmatch[]; issues: Issue[]; discards: Discard[] }
const localDate = () => new Date().toISOString().slice(0, 10)
const demoDonations: Donation[] = [
  { id: 'DN-000006', donorId: 'donor-6', donorName: 'Ethan Kim', bagNumber: 'RHG-2026-00421', date: localDate(), volumeMl: 450, screening: { hb: 14.1, weight: 72, bp: '118/76', pulse: 72, temp: 36.7 }, status: 'testing' },
  { id: 'DN-000012', donorId: 'donor-12', donorName: 'James Wilson', bagNumber: 'RHG-2026-00420', date: localDate(), volumeMl: 450, screening: { hb: 13.4, weight: 81, bp: '122/80', pulse: 76, temp: 36.8 }, status: 'testing' },
  { id: 'DN-000018', donorId: 'donor-18', donorName: 'Arjun Shah', bagNumber: 'RHG-2026-00419', date: localDate(), volumeMl: 450, screening: { hb: 15, weight: 68, bp: '116/74', pulse: 70, temp: 36.6 }, status: 'quarantine' },
]
const demoTests: BloodTest[] = [{ id: 'DN-000018', donationId: 'DN-000018', abo: 'B', rh: 'positive', hiv: 'negative', hbsag: 'reactive', hcv: 'negative', syphilis: 'negative', malaria: 'negative', testedAt: localDate() }]
const initialData: WorkflowData = isFirebaseConfigured
  ? { donors: [], donations: [], tests: [], units: [], requests: [], camps: [], audit: [], crossmatches: [], issues: [], discards: [] }
  : { donors: [...memoryDonors], donations: [...demoDonations], tests: [...demoTests], units: [...seedUnits], requests: [...seedRequests], camps: [{ id: 'CAMP-026', name: 'World Blood Donor Day Drive', place: 'Civic Centre, New Delhi', date: localDate(), targetDonors: 80, collectedCount: 54 }, { id: 'CAMP-025', name: 'Riverside Tech Park Drive', place: 'Gurugram, Haryana', date: localDate(), targetDonors: 60, collectedCount: 42 }], audit: [{ id: 'AUD-1001', user: 'Jordan Carter', action: 'Screening entered', entity: 'Donation', entityId: 'RHG-2026-00421', timestamp: new Date().toISOString(), details: '450 mL collected; donor passed eligibility checks.' }], crossmatches: [], issues: [], discards: [] }
export const workflowData: WorkflowData = initialData
export const settings = { expiryAlertDays: 3, donationIntervalDays: 90, lowStockThresholds: { 'A+': 4, 'A-': 2, 'B+': 3, 'B-': 2, 'AB+': 2, 'AB-': 1, 'O+': 4, 'O-': 3 } as Record<BloodGroup, number> }
const replace = <T,>(target: T[], values: T[]) => { target.splice(0, target.length, ...values) }
const mapDocs = <T,>(snapshot: QuerySnapshot<DocumentData>) => snapshot.docs.map(item => {
  const data = item.data()
  if (data.expiryDate instanceof Timestamp) data.expiryDate = data.expiryDate.toDate().toISOString().slice(0, 10)
  if (data.campDate instanceof Timestamp) data.date = data.campDate.toDate().toISOString().slice(0, 10)
  return { ...data, id: item.id } as T
})

function snapshotWorkflowData(): WorkflowData {
  return { donors: [...workflowData.donors], donations: [...workflowData.donations], tests: [...workflowData.tests], units: [...workflowData.units], requests: [...workflowData.requests], camps: [...workflowData.camps], audit: [...workflowData.audit], crossmatches: [...workflowData.crossmatches], issues: [...workflowData.issues], discards: [...workflowData.discards] }
}
export function getWorkflowData() { return snapshotWorkflowData() }

export async function loadWorkflowData(): Promise<WorkflowData> {
  const database = firestore
  if (!database || !isFirebaseConfigured) {
    workflowData.donors = [...memoryDonors]
    return snapshotWorkflowData()
  }
  const names = ['donors', 'donations', 'tests', 'units', 'requests', 'camps', 'auditLogs', 'crossmatches', 'issues', 'discards']
  const snapshots = await Promise.all(names.map(name => getDocs(query(collection(database, name)))))
  workflowData.donors = mapDocs<Donor>(snapshots[0])
  replace(workflowData.donations, mapDocs<Donation>(snapshots[1]))
  replace(workflowData.tests, mapDocs<BloodTest>(snapshots[2]))
  replace(workflowData.units, mapDocs<Unit>(snapshots[3]))
  replace(workflowData.requests, mapDocs<Request>(snapshots[4]))
  replace(workflowData.camps, mapDocs<Camp>(snapshots[5]))
  replace(workflowData.audit, mapDocs<AuditEvent>(snapshots[6]).map(item => ({ ...item, user: item.actor || item.user, timestamp: item.timestamp || localDate() })))
  replace(workflowData.crossmatches, mapDocs<Crossmatch>(snapshots[7]))
  replace(workflowData.issues, mapDocs<Issue>(snapshots[8]))
  replace(workflowData.discards, mapDocs<Discard>(snapshots[9]))
  const userId = auth?.currentUser?.uid
  if (userId) {
    const settingsRef = doc(database, 'settings', userId)
    let saved: DocumentData | undefined
    try {
      saved = (await getDoc(settingsRef)).data()
    } catch (error) {
      if (!isFirebaseOfflineError(error)) throw error
      try { saved = (await getDocFromCache(settingsRef)).data() } catch { saved = undefined }
    }
    if (saved) {
      settings.expiryAlertDays = Number(saved.expiryAlertDays ?? settings.expiryAlertDays)
      settings.donationIntervalDays = Number(saved.donationIntervalDays ?? settings.donationIntervalDays)
      settings.lowStockThresholds = { ...settings.lowStockThresholds, ...saved.lowStockThresholds } as Record<BloodGroup, number>
    }
  }
  return snapshotWorkflowData()
}

export async function loadCurrentStaffRole(): Promise<Role> {
  if (!firestore || !isFirebaseConfigured) return 'admin'
  const id = auth?.currentUser?.uid
  if (!id) throw new Error('Sign in to continue.')
  const profileRef = doc(firestore, 'users', id)
  let profile
  try {
    profile = await getDoc(profileRef)
  } catch (error) {
    if (!isFirebaseOfflineError(error)) throw error
    try { profile = await getDocFromCache(profileRef) } catch { throw new Error('Staff access cannot be verified while offline.') }
  }
  if (!profile.exists() || profile.data().active !== true) throw new Error('This account is not an active hospital staff member.')
  return profile.data().role as Role
}

function userId() {
  if (!firestore || !isFirebaseConfigured) return null
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('An internet connection is required to save blood bank records safely.')
  const id = auth?.currentUser?.uid
  if (!id) throw new Error('Sign in with an active hospital account to continue.')
  return id
}
async function put(collectionName: string, id: string, data: DocumentData) {
  if (firestore && isFirebaseConfigured) await setDoc(doc(firestore, collectionName, id), data)
}
async function patch(collectionName: string, id: string, data: DocumentData) {
  if (firestore && isFirebaseConfigured) await updateDoc(doc(firestore, collectionName, id), data)
}
async function addAudit(action: string, entity: string, entityId: string, details: string) {
  const uid = userId()
  const event: AuditEvent = { id: `AUD-${Date.now()}`, user: auth?.currentUser?.displayName || auth?.currentUser?.email || 'Jordan Carter', actor: auth?.currentUser?.displayName || auth?.currentUser?.email || 'Jordan Carter', action, entity, entityId, timestamp: new Date().toISOString(), details }
  if (firestore && uid) {
    const ref = doc(collection(firestore, 'auditLogs'))
    event.id = ref.id
    await setDoc(ref, { ...event, user: uid, actor: event.actor })
  }
  workflowData.audit.unshift(event)
}

export function getDonor(donorId: string): Donor | undefined { return workflowData.donors.find(donor => donor.id === donorId || donor.donorId === donorId) }
export function donationEligibility(donor: Donor, intervalDays = settings.donationIntervalDays) {
  const daysSinceLast = donor.lastDonationDate ? Math.floor((Date.now() - new Date(donor.lastDonationDate).getTime()) / 86400000) : Infinity
  const deferralActive = donor.deferral.type === 'permanent' || (donor.deferral.type === 'temporary' && (!donor.deferral.until || donor.deferral.until >= localDate()))
  return { eligible: !deferralActive && daysSinceLast >= intervalDays, deferralActive, daysSinceLast, nextEligibleDate: donor.lastDonationDate ? new Date(new Date(donor.lastDonationDate).getTime() + intervalDays * 86400000).toISOString().slice(0, 10) : localDate() }
}

export async function createCollection(input: { donorId: string; hb: number; weight: number; bp: string; pulse: number; temp: number; campId?: string }) {
  userId()
  const donor = getDonor(input.donorId)
  if (!donor) throw new Error('Donor not found. Refresh the donor list and try again.')
  const eligibility = donationEligibility(donor)
  if (!eligibility.eligible) throw new Error(eligibility.deferralActive ? 'This donor has an active deferral and cannot donate.' : `Donation interval not met. Next eligible date: ${eligibility.nextEligibleDate}.`)
  if (input.hb < 12.5 || input.weight < 45 || input.pulse < 50 || input.pulse > 100 || input.temp > 37.5) throw new Error('Screening criteria not met. Donation was not collected.')
  const bagNumber = `RHG-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
  const ref = firestore && isFirebaseConfigured ? doc(collection(firestore, 'donations')) : null
  const donation: Donation = { id: ref?.id || `DN-${Date.now()}`, donorId: donor.id, donorName: donor.name, bagNumber, date: localDate(), volumeMl: 450, screening: { hb: input.hb, weight: input.weight, bp: input.bp, pulse: input.pulse, temp: input.temp }, status: 'testing' }
  if (ref) await setDoc(ref, { ...donation, collectedOn: donation.date, campId: input.campId || null })
  if (firestore && isFirebaseConfigured) await patch('donors', donor.id, { lastDonationDate: donation.date })
  donor.lastDonationDate = donation.date
  workflowData.donations.unshift(donation)
  if (input.campId) {
    const camp = workflowData.camps.find(item => item.id === input.campId)
    if (camp) { camp.collectedCount += 1; await patch('camps', camp.id, { collectedCount: camp.collectedCount }) }
  }
  await addAudit('Collection recorded', 'Donation', donation.bagNumber, `450 mL collected from ${donor.name}.`)
  return donation
}

export async function recordBloodTests(input: Omit<BloodTest, 'id' | 'testedAt'>) {
  userId()
  const donation = workflowData.donations.find(item => item.id === input.donationId)
  if (!donation) throw new Error('Donation not found. Refresh the testing queue and try again.')
  if (donation.status === 'available') throw new Error('This donation has already passed screening and been released.')
  const test: BloodTest = { ...input, id: input.donationId, testedAt: new Date().toISOString() }
  const infectionResults = [test.hiv, test.hbsag, test.hcv, test.syphilis, test.malaria]
  const hasReactive = infectionResults.includes('reactive')
  const groupIsConfirmed = test.abo !== 'pending' && test.rh !== 'pending'
  const bloodGroup = `${test.abo}${test.rh === 'positive' ? '+' : '-'}` as BloodGroup
  const validBloodGroup = ['A+','A-','B+','B-','AB+','AB-','O+','O-'].includes(bloodGroup)
  if (groupIsConfirmed && !validBloodGroup) throw new Error('ABO/Rh result is invalid. Unit remains in testing.')
  const testsComplete = infectionResults.every(result => result === 'negative') && groupIsConfirmed && validBloodGroup
  if (firestore && isFirebaseConfigured) {
    await put('tests', donation.id, { donationId: donation.id, abo: test.abo, rh: test.rh, hiv: test.hiv, hbsag: test.hbsag, hcv: test.hcv, syphilis: test.syphilis, malaria: test.malaria, testedAt: test.testedAt })
    const unitRef = doc(firestore, 'units', donation.bagNumber)
    const currentUnit = workflowData.units.find(item => item.id === donation.bagNumber)
    if (hasReactive) {
      await patch('donations', donation.id, { status: 'quarantine' })
      donation.status = 'quarantine'
    }
    if (groupIsConfirmed && validBloodGroup && (hasReactive || testsComplete)) {
      const unit: Unit = { id: donation.bagNumber, donationRef: donation.id, bloodGroup, component: 'WHOLE BLOOD', status: 'testing', expiryDate: new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10) }
      const unitData = { ...unit, expiryDate: Timestamp.fromDate(new Date(`${unit.expiryDate}T23:59:59.999Z`)) }
      if (!currentUnit) await setDoc(unitRef, unitData)
      const status: Unit['status'] = hasReactive ? 'quarantine' : 'available'
      await updateDoc(unitRef, { status, bloodGroup })
      if (testsComplete) {
        await patch('donations', donation.id, { status: 'available' })
        donation.status = 'available'
      }
      if (!currentUnit) workflowData.units.unshift({ ...unit, status })
      else { currentUnit.status = status; currentUnit.bloodGroup = bloodGroup }
    }
  }
  const previous = workflowData.tests.findIndex(item => item.donationId === input.donationId)
  if (previous >= 0) workflowData.tests[previous] = test; else workflowData.tests.unshift(test)
  if (hasReactive) {
    donation.status = 'quarantine'
    await addAudit('Unit quarantined', 'Donation', donation.bagNumber, 'A reactive infection-screening result was recorded.')
    return { test, unit: null, status: 'quarantine' as const }
  }
  if (!testsComplete) return { test, unit: null, status: 'testing' as const }
  donation.status = 'available'
  const unit = workflowData.units.find(item => item.id === donation.bagNumber) || { id: donation.bagNumber, donationRef: donation.id, bloodGroup, component: 'WHOLE BLOOD' as const, status: 'available' as const, expiryDate: new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10) }
  if (!workflowData.units.includes(unit)) workflowData.units.unshift(unit)
  await addAudit('Unit released', 'Unit', unit.id, `All infection screens negative; ${bloodGroup} confirmed.`)
  return { test, unit, status: 'available' as const }
}

export async function createBloodRequest(input: Omit<Request, 'id' | 'status'>) {
  userId()
  if (!Number.isInteger(input.units) || input.units < 1 || input.units > 10) throw new Error('Units required must be between 1 and 10.')
  const ref = firestore && isFirebaseConfigured ? doc(collection(firestore, 'requests')) : null
  const request: Request = { ...input, id: ref?.id || `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, status: 'Pending' }
  if (ref) await setDoc(ref, request)
  workflowData.requests.unshift(request)
  await addAudit('Request created', 'Request', request.id, `${request.units} ${request.component} requested for ${request.patient}.`)
  return request
}

const rbcCompatibility: Record<BloodGroup, BloodGroup[]> = {
  'O-':['O-'], 'O+':['O-','O+'], 'A-':['O-','A-'], 'A+':['O-','O+','A-','A+'],
  'B-':['O-','B-'], 'B+':['O-','O+','B-','B+'], 'AB-':['O-','A-','B-','AB-'],
  'AB+':['O-','O+','A-','A+','B-','B+','AB-','AB+'],
}
const plasmaCompatibility: Record<BloodGroup, BloodGroup[]> = {
  'O-':['O-','O+','A-','A+','B-','B+','AB-','AB+'], 'O+':['O-','O+','A-','A+','B-','B+','AB-','AB+'],
  'A-':['A-','A+','AB-','AB+'], 'A+':['A-','A+','AB-','AB+'],
  'B-':['B-','B+','AB-','AB+'], 'B+':['B-','B+','AB-','AB+'],
  'AB-':['AB-','AB+'], 'AB+':['AB-','AB+'],
}
function unitCompatible(request: Request, unit: Unit) {
  if (unit.component !== request.component) return false
  if (request.component === 'PLASMA') return plasmaCompatibility[request.bloodGroup].includes(unit.bloodGroup)
  if (request.component === 'WHOLE BLOOD') return unit.bloodGroup === request.bloodGroup
  return rbcCompatibility[request.bloodGroup].includes(unit.bloodGroup)
}
export function compatibleUnits(request: Request) {
  return workflowData.units.filter(unit => unit.status === 'available' && unit.expiryDate >= localDate() && unitCompatible(request, unit)).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate))
}
export async function recordCrossmatch(requestId: string, unitId: string, result: 'compatible'|'incompatible') {
  userId()
  const request = workflowData.requests.find(item=>item.id===requestId)
  const unit = workflowData.units.find(item=>item.id===unitId)
  if (!request || !unit) throw new Error('Request or unit not found.')
  if (unit.status !== 'available' || unit.expiryDate < localDate()) throw new Error('Unit is not available or has expired.')
  if (result === 'compatible' && !unitCompatible(request, unit)) throw new Error('Blood group or component incompatibility. This unit cannot be cross-matched.')
  const match: Crossmatch = { id: `XM-${Date.now()}`, requestId, unitId, result, doneAt: new Date().toISOString() }
  if (firestore && isFirebaseConfigured) {
    const batch = writeBatch(firestore)
    batch.set(doc(firestore, 'crossmatches', match.id), match)
    if (result === 'compatible') {
      batch.update(doc(firestore, 'units', unitId), { status: 'reserved' })
      batch.update(doc(firestore, 'requests', requestId), { status: 'Ready' })
    } else batch.update(doc(firestore, 'requests', requestId), { status: 'Crossmatching' })
    await batch.commit()
  }
  workflowData.crossmatches.unshift(match)
  if (result === 'compatible') { unit.status = 'reserved'; request.status = 'Ready' } else request.status = 'Crossmatching'
  await addAudit('Cross-match recorded', 'Unit', unitId, `${result} for request ${requestId}.`)
  return match
}
export async function issueBloodUnit(requestId: string, unitId: string, approvedBy?: string, emergency = false) {
  userId()
  const request = workflowData.requests.find(item=>item.id===requestId)
  const unit = workflowData.units.find(item=>item.id===unitId)
  if (!request || !unit) throw new Error('Request or unit not found.')
  if (unit.expiryDate < localDate() || unit.status === 'expired') throw new Error('Expired units cannot be issued.')
  const validEmergency = emergency && request.urgency === 'emergency' && unit.bloodGroup === 'O-' && Boolean(approvedBy?.trim())
  const hasCompatibleMatch = workflowData.crossmatches.some(match=>match.requestId===requestId&&match.unitId===unitId&&match.result==='compatible')
  if (!validEmergency && !hasCompatibleMatch) throw new Error('A compatible cross-match is required before issuing.')
  if (!['available','reserved'].includes(unit.status)) throw new Error('Unit is not available for issue.')
  if (emergency && !validEmergency) throw new Error('Emergency quick issue requires an emergency request, O-negative unit, and medical officer approval.')
  const issue: Issue = { id: `ISS-${Date.now()}`, requestId, unitId, issuedTo: request.patient, approvedBy: approvedBy || 'Medical officer', date: new Date().toISOString(), emergency }
  if (firestore && isFirebaseConfigured) {
    const batch = writeBatch(firestore)
    batch.update(doc(firestore, 'units', unitId), { status: 'issued', ...(emergency ? { emergencyRequestId: requestId, emergencyApprovedBy: approvedBy } : {}) })
    batch.update(doc(firestore, 'requests', requestId), { status: 'Issued' })
    batch.set(doc(firestore, 'issues', issue.id), issue)
    await batch.commit()
  }
  unit.status = 'issued'; request.status = 'Issued'; workflowData.issues.unshift(issue)
  if (emergency) await addAudit('Emergency O-negative issue', 'Unit', unitId, `Quick-issued to ${request.patient}; approved by ${approvedBy}.`)
  await addAudit('Unit issued', 'Unit', unitId, `Issued to ${request.patient} on request ${requestId}.`)
  return issue
}
export async function discardBloodUnit(unitId: string, reason: string, approvedBy: string) {
  userId()
  const unit = workflowData.units.find(item=>item.id===unitId)
  if (!unit) throw new Error('Unit not found.')
  if (!reason.trim() || !approvedBy.trim()) throw new Error('A discard reason and medical officer approver are required.')
  if (unit.status === 'issued' || unit.status === 'discarded') throw new Error('Issued or already discarded units cannot be discarded.')
  const discard: Discard = { id: `DSC-${Date.now()}`, unitId, reason, approvedBy, date: new Date().toISOString() }
  if (firestore && isFirebaseConfigured) {
    const batch = writeBatch(firestore)
    batch.update(doc(firestore, 'units', unitId), { status: 'discarded' })
    batch.set(doc(firestore, 'discards', discard.id), discard)
    await batch.commit()
  }
  unit.status = 'discarded'; workflowData.discards.unshift(discard)
  await addAudit('Unit discarded', 'Unit', unitId, `${reason}; approved by ${approvedBy}.`)
  return discard
}
export async function createBloodCamp(input: Omit<Camp, 'id'|'collectedCount'>) {
  userId()
  const ref = firestore && isFirebaseConfigured ? doc(collection(firestore, 'camps')) : null
  const camp: Camp = { ...input, id: ref?.id || `CAMP-${Date.now()}`, collectedCount: 0 }
  if (ref) await setDoc(ref, { ...camp, campDate: camp.date })
  workflowData.camps.unshift(camp)
  await addAudit('Camp scheduled', 'Camp', camp.id, `${camp.name} at ${camp.place}.`)
  return camp
}
export async function saveSettings(input: { donationIntervalDays: number; expiryAlertDays: number; lowStockThresholds: Record<BloodGroup, number> }) {
  userId()
  Object.assign(settings, input)
  if (firestore && isFirebaseConfigured && auth?.currentUser) await setDoc(doc(firestore, 'settings', auth.currentUser.uid), input)
  await addAudit('Settings updated', 'Settings', auth?.currentUser?.uid || 'demo', 'Blood bank thresholds and donor policy updated.')
  return settings
}
export function logAction(action: string, entity: string, entityId: string, details: string) { return addAudit(action, entity, entityId, details) }
