import type { BloodGroup, Donor, Request, Unit } from './types'

const groups: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const names = ['Olivia Chen','Noah Williams','Amara Okafor','Liam Patel','Sofia Garcia','Ethan Kim','Maya Singh','Lucas Brown','Ava Johnson','Mason Lee','Zara Ahmed','James Wilson','Priya Nair','Benjamin Clark','Leila Hassan','Daniel Martin','Isabella Davis','Arjun Shah','Grace Taylor','Samuel Moore']
const today = new Date()
const iso = (date: Date) => date.toISOString().slice(0, 10)

export const seedDonors: Donor[] = names.map((name, index) => ({
  id: `donor-${index + 1}`, donorId: `DN-${String(index + 1).padStart(6, '0')}`, name,
  dob: `${1980 + (index % 20)}-${String((index % 12) + 1).padStart(2, '0')}-15`, gender: index % 3 === 0 ? 'Female' : 'Male',
  phone: `+91${String(9876500000 + index * 13).padStart(10, '0')}`,
  address: `${100 + index} ${['Oak','Maple','Cedar','Pine'][index % 4]} Street`, bloodGroup: groups[index % groups.length],
  donorType: index % 4 === 0 ? 'replacement' : 'voluntary', lastDonationDate: index % 3 === 0 ? iso(new Date(today.getTime() - (35 + index * 18) * 86400000)) : null,
  deferral: { type: index === 13 ? 'temporary' : 'none', reason: index === 13 ? 'Low hemoglobin' : '', until: index === 13 ? iso(new Date(today.getTime() + 12 * 86400000)) : null }, createdAt: iso(new Date(today.getTime() - index * 86400000 * 22)),
}))

export const seedUnits: Unit[] = Array.from({ length: 40 }, (_, index) => ({
  id: `BB-${String(2026001 + index).padStart(7, '0')}`, bloodGroup: groups[index % groups.length],
  component: (['PRBC', 'PLASMA', 'PLATELETS', 'WHOLE BLOOD'] as const)[index % 4],
  status: index % 13 === 0 ? 'quarantine' : index % 19 === 0 ? 'reserved' : index % 9 === 0 ? 'testing' : 'available',
  expiryDate: iso(new Date(today.getTime() + (index % 8 === 0 ? 2 + index % 3 : 8 + index * 2) * 86400000)),
}))
seedUnits.push(
  { id: 'BB-2026041', bloodGroup: 'O-', component: 'PRBC', status: 'available', expiryDate: iso(new Date(today.getTime() + 14 * 86400000)) },
  { id: 'BB-2026042', bloodGroup: 'A+', component: 'PRBC', status: 'available', expiryDate: iso(new Date(today.getTime() + 20 * 86400000)) },
  { id: 'BB-2026043', bloodGroup: 'B+', component: 'PLASMA', status: 'available', expiryDate: iso(new Date(today.getTime() + 30 * 86400000)) },
  { id: 'BB-2026044', bloodGroup: 'AB+', component: 'PLATELETS', status: 'available', expiryDate: iso(new Date(today.getTime() + 4 * 86400000)) },
)

export const seedRequests: Request[] = [
  { id: 'REQ-2026-041', patient: 'Eleanor Price', ward: 'ICU · Bed 08', bloodGroup: 'O-', component: 'PRBC', units: 2, urgency: 'emergency', status: 'Pending' },
  { id: 'REQ-2026-040', patient: 'Marcus Thompson', ward: 'Surgery · Bed 14', bloodGroup: 'A+', component: 'PRBC', units: 2, urgency: 'urgent', status: 'Crossmatching' },
  { id: 'REQ-2026-039', patient: 'Amelia Robinson', ward: 'Maternity · Bed 03', bloodGroup: 'B+', component: 'PLASMA', units: 1, urgency: 'routine', status: 'Pending' },
  { id: 'REQ-2026-038', patient: 'Henry Wilson', ward: 'Oncology · Bed 21', bloodGroup: 'AB+', component: 'PLATELETS', units: 1, urgency: 'routine', status: 'Ready' },
  { id: 'REQ-2026-037', patient: 'Mia Anderson', ward: 'ICU · Bed 11', bloodGroup: 'O+', component: 'PRBC', units: 3, urgency: 'urgent', status: 'Pending' },
]

export const monthlyActivity = [
  { month: 'Jun', collections: 128, issues: 94 }, { month: 'Jul', collections: 142, issues: 111 },
  { month: 'Aug', collections: 119, issues: 105 }, { month: 'Sep', collections: 156, issues: 126 },
  { month: 'Oct', collections: 137, issues: 118 }, { month: 'Nov', collections: 164, issues: 132 },
]
