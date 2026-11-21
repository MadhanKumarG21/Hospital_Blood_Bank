import { collection, getDocs, doc, query, orderBy, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { z } from 'zod'
import { firestore } from '../firebase'
import { seedDonors } from '../seed'
import type { Donor } from '../types'

export const donorRegistrationSchema = z.object({
  name: z.string().trim().min(2, 'Enter the donor’s full name'),
  phone: z.string().trim().regex(/^\+91[6-9]\d{9}$/, 'Use +91 followed by exactly 10 digits'),
  dob: z.string().min(1, 'Date of birth is required').refine(value => !Number.isNaN(Date.parse(value)) && value <= new Date().toISOString().slice(0, 10), 'Enter a valid date of birth'),
  gender: z.enum(['Female', 'Male', 'Other']),
  address: z.string().trim().min(3, 'Enter an address'),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  donorType: z.enum(['voluntary', 'replacement']),
})

export type DonorRegistrationInput = z.infer<typeof donorRegistrationSchema>

export let memoryDonors = [...seedDonors]
export async function listDonors(): Promise<Donor[]> {
  if (!firestore) return [...memoryDonors]
  const result = await getDocs(query(collection(firestore, 'donors'), orderBy('createdAt', 'desc')))
  return result.docs.map((item) => ({ id: item.id, ...item.data() }) as Donor)
}
export async function createDonor(input: DonorRegistrationInput): Promise<Donor> {
  const parsed = donorRegistrationSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Check the donor details and try again.')
  const nextNumber = memoryDonors.length + 1
  const donor: Donor = { ...parsed.data, id: `donor-${nextNumber}`, donorId: `DN-${String(nextNumber).padStart(6, '0')}`, lastDonationDate: null, deferral: { type: 'none', reason: '', until: null }, createdAt: new Date().toISOString().slice(0, 10) }
  if (!firestore) { memoryDonors = [donor, ...memoryDonors]; return donor }
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('An internet connection is required to save donor records safely.')
  const reference = doc(collection(firestore, 'donors'))
  const persistedDonor = { ...donor, id: reference.id, donorId: `DN-${reference.id.slice(0, 8).toUpperCase()}` }
  await setDoc(reference, persistedDonor)
  return persistedDonor
}

export async function updateDonor(id: string, input: Partial<Donor>): Promise<Donor> {
  const index = memoryDonors.findIndex(d => d.id === id || d.donorId === id)
  if (index === -1) throw new Error('Donor record not found.')
  const existing = memoryDonors[index]
  const updated: Donor = {
    ...existing,
    ...input,
    deferral: input.deferral ? { ...existing.deferral, ...input.deferral } : existing.deferral,
  }
  memoryDonors[index] = updated

  if (firestore) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('An internet connection is required to update donor records safely.')
    }
    await updateDoc(doc(firestore, 'donors', existing.id), updated)
  }
  return updated
}

export async function deleteDonor(id: string): Promise<void> {
  const index = memoryDonors.findIndex(d => d.id === id || d.donorId === id)
  if (index === -1) throw new Error('Donor record not found.')
  const existing = memoryDonors[index]
  memoryDonors.splice(index, 1)

  if (firestore) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('An internet connection is required to delete donor records safely.')
    }
    await deleteDoc(doc(firestore, 'donors', existing.id))
  }
}
