export type Role = 'admin' | 'medical_officer' | 'lab_tech' | 'nurse_phlebotomist' | 'receptionist'
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
export type DonorType = 'voluntary' | 'replacement'
export type Donor = {
  id: string
  donorId: string
  name: string
  dob: string
  gender: 'Female' | 'Male' | 'Other'
  phone: string
  address: string
  bloodGroup: BloodGroup
  donorType: DonorType
  lastDonationDate: string | null
  deferral: { type: 'none' | 'temporary' | 'permanent'; reason: string; until: string | null }
  createdAt: string
}
export type Unit = { id: string; donationRef?: string; parentUnitRef?: string; bloodGroup: BloodGroup; component: 'PRBC' | 'PLASMA' | 'PLATELETS' | 'WHOLE BLOOD' | 'CRYO'; status: 'collected' | 'testing' | 'available' | 'quarantine' | 'reserved' | 'issued' | 'expired' | 'discarded'; expiryDate: string }
export type Request = { id: string; patient: string; ward: string; bloodGroup: BloodGroup; component: string; units: number; urgency: 'routine' | 'urgent' | 'emergency'; status: string; age?: number; gender?: string; uhid?: string; doctor?: string; diagnosis?: string }
export type UserProfile = { uid: string; name: string; email: string; role: Role; active: boolean }
