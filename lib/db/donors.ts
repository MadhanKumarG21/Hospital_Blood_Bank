import { collection, getDocs, doc, query, orderBy, setDoc } from 'firebase/firestore'
import { firestore } from '../firebase'
import { seedDonors } from '../seed'
import type { Donor } from '../types'

export let memoryDonors = [...seedDonors]
export async function listDonors(): Promise<Donor[]> {
  if (!firestore) return [...memoryDonors]
  const result = await getDocs(query(collection(firestore, 'donors'), orderBy('createdAt', 'desc')))
  return result.docs.map((item) => ({ id: item.id, ...item.data() }) as Donor)
}
export async function createDonor(input: Omit<Donor, 'id' | 'donorId' | 'createdAt'>): Promise<Donor> {
  const nextNumber = memoryDonors.length + 1
  const donor: Donor = { ...input, id: `donor-${nextNumber}`, donorId: `DN-${String(nextNumber).padStart(6, '0')}`, createdAt: new Date().toISOString().slice(0, 10) }
  if (!firestore) { memoryDonors = [donor, ...memoryDonors]; return donor }
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('An internet connection is required to save donor records safely.')
  const reference = doc(collection(firestore, 'donors'))
  const persistedDonor = { ...donor, id: reference.id, donorId: `DN-${reference.id.slice(0, 8).toUpperCase()}` }
  await setDoc(reference, persistedDonor)
  return persistedDonor
}
