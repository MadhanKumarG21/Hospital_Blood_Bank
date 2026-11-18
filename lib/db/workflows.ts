import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import {
  auth,
  firestore,
  isFirebaseConfigured,
  isFirebaseOfflineError,
} from "../firebase";
import { monthlyActivity, seedRequests, seedUnits } from "../seed";
import { memoryDonors } from "./donors";
import { z } from "zod";
import type {
  BloodGroup,
  Donor,
  Request,
  RequestStatus,
  Role,
  Unit,
} from "../types";

export type Infection = "negative" | "reactive" | "pending";
export type Donation = {
  id: string;
  donorId: string;
  donorName: string;
  bagNumber: string;
  date: string;
  volumeMl: number;
  screening: {
    hb: number;
    weight: number;
    bp: string;
    pulse: number;
    temp: number;
  };
  status: "testing" | "quarantine" | "available";
};
export type BloodTest = {
  id: string;
  donationId: string;
  abo: string;
  rh: "positive" | "negative" | "pending";
  hiv: Infection;
  hbsag: Infection;
  hcv: Infection;
  syphilis: Infection;
  malaria: Infection;
  testedAt: string;
};
export type Camp = {
  id: string;
  name: string;
  place: string;
  date: string;
  targetDonors: number;
  collectedCount: number;
};
export type AuditEvent = {
  id: string;
  user: string;
  actor?: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  details: string;
};
export type Crossmatch = {
  id: string;
  requestId: string;
  unitId: string;
  result: "compatible" | "incompatible";
  doneAt: string;
};
export type Discard = {
  id: string;
  unitId: string;
  reason: string;
  approvedBy: string;
  date: string;
};
export type Issue = {
  id: string;
  requestId: string;
  unitId: string;
  issuedTo: string;
  approvedBy: string;
  date: string;
  emergency: boolean;
};

export type WorkflowData = {
  donors: Donor[];
  donations: Donation[];
  tests: BloodTest[];
  units: Unit[];
  requests: Request[];
  camps: Camp[];
  audit: AuditEvent[];
  crossmatches: Crossmatch[];
  issues: Issue[];
  discards: Discard[];
};
const localDate = () => new Date().toISOString().slice(0, 10);
const demoDonations: Donation[] = [
  {
    id: "DN-000006",
    donorId: "donor-6",
    donorName: "Ethan Kim",
    bagNumber: "RHG-2026-00421",
    date: localDate(),
    volumeMl: 450,
    screening: { hb: 14.1, weight: 72, bp: "118/76", pulse: 72, temp: 36.7 },
    status: "testing",
  },
  {
    id: "DN-000012",
    donorId: "donor-12",
    donorName: "James Wilson",
    bagNumber: "RHG-2026-00420",
    date: localDate(),
    volumeMl: 450,
    screening: { hb: 13.4, weight: 81, bp: "122/80", pulse: 76, temp: 36.8 },
    status: "testing",
  },
  {
    id: "DN-000018",
    donorId: "donor-18",
    donorName: "Arjun Shah",
    bagNumber: "RHG-2026-00419",
    date: localDate(),
    volumeMl: 450,
    screening: { hb: 15, weight: 68, bp: "116/74", pulse: 70, temp: 36.6 },
    status: "quarantine",
  },
];
const demoTests: BloodTest[] = [
  {
    id: "DN-000018",
    donationId: "DN-000018",
    abo: "B",
    rh: "positive",
    hiv: "negative",
    hbsag: "reactive",
    hcv: "negative",
    syphilis: "negative",
    malaria: "negative",
    testedAt: localDate(),
  },
];
const initialData: WorkflowData = isFirebaseConfigured
  ? {
      donors: [],
      donations: [],
      tests: [],
      units: [],
      requests: [],
      camps: [],
      audit: [],
      crossmatches: [],
      issues: [],
      discards: [],
    }
  : {
      donors: [...memoryDonors],
      donations: [...demoDonations],
      tests: [...demoTests],
      units: [...seedUnits],
      requests: [...seedRequests],
      camps: [
        {
          id: "CAMP-026",
          name: "World Blood Donor Day Drive",
          place: "Civic Centre, New Delhi",
          date: localDate(),
          targetDonors: 80,
          collectedCount: 54,
        },
        {
          id: "CAMP-025",
          name: "Riverside Tech Park Drive",
          place: "Gurugram, Haryana",
          date: localDate(),
          targetDonors: 60,
          collectedCount: 42,
        },
      ],
      audit: [
        {
          id: "AUD-1001",
          user: "Jordan Carter",
          action: "Screening entered",
          entity: "Donation",
          entityId: "RHG-2026-00421",
          timestamp: new Date().toISOString(),
          details: "450 mL collected; donor passed eligibility checks.",
        },
      ],
      crossmatches: [],
      issues: [],
      discards: [],
    };
export const workflowData: WorkflowData = initialData;
export const settings = {
  expiryAlertDays: 3,
  donationIntervalDays: 90,
  lowStockThresholds: {
    "A+": 4,
    "A-": 2,
    "B+": 3,
    "B-": 2,
    "AB+": 2,
    "AB-": 1,
    "O+": 4,
    "O-": 3,
  } as Record<BloodGroup, number>,
};
const replace = <T>(target: T[], values: T[]) => {
  target.splice(0, target.length, ...values);
};
const mapDocs = <T>(snapshot: QuerySnapshot<DocumentData>) =>
  snapshot.docs.map((item) => {
    const data = item.data();
    if (data.expiryDate instanceof Timestamp)
      data.expiryDate = data.expiryDate.toDate().toISOString().slice(0, 10);
    if (data.campDate instanceof Timestamp)
      data.date = data.campDate.toDate().toISOString().slice(0, 10);
    return { ...data, id: item.id } as T;
  });

function snapshotWorkflowData(): WorkflowData {
  return {
    donors: [...workflowData.donors],
    donations: [...workflowData.donations],
    tests: [...workflowData.tests],
    units: workflowData.units.map((unit) => ({
      ...unit,
      status: getUnitDisplayStatus(unit),
    })),
    requests: [...workflowData.requests],
    camps: [...workflowData.camps],
    audit: [...workflowData.audit],
    crossmatches: [...workflowData.crossmatches],
    issues: [...workflowData.issues],
    discards: [...workflowData.discards],
  };
}
export function getWorkflowData() {
  return snapshotWorkflowData();
}

export function getUnitDisplayStatus(
  unit: Unit,
  today = localDate(),
): Unit["status"] {
  if (unit.expiryDate < today && !["issued", "discarded"].includes(unit.status))
    return "expired";
  return unit.status;
}

export async function loadWorkflowData(): Promise<WorkflowData> {
  const database = firestore;
  if (!database || !isFirebaseConfigured) {
    workflowData.donors = [...memoryDonors];
    return snapshotWorkflowData();
  }
  const names = [
    "donors",
    "donations",
    "tests",
    "units",
    "requests",
    "camps",
    "auditLogs",
    "crossmatches",
    "issues",
    "discards",
  ];
  const snapshots = await Promise.all(
    names.map((name) => getDocs(query(collection(database, name)))),
  );
  workflowData.donors = mapDocs<Donor>(snapshots[0]);
  replace(workflowData.donations, mapDocs<Donation>(snapshots[1]));
  replace(workflowData.tests, mapDocs<BloodTest>(snapshots[2]));
  replace(workflowData.units, mapDocs<Unit>(snapshots[3]));
  replace(workflowData.requests, mapDocs<Request>(snapshots[4]));
  replace(workflowData.camps, mapDocs<Camp>(snapshots[5]));
  replace(
    workflowData.audit,
    mapDocs<AuditEvent>(snapshots[6]).map((item) => ({
      ...item,
      user: item.actor || item.user,
      timestamp: item.timestamp || localDate(),
    })),
  );
  replace(workflowData.crossmatches, mapDocs<Crossmatch>(snapshots[7]));
  replace(workflowData.issues, mapDocs<Issue>(snapshots[8]));
  replace(workflowData.discards, mapDocs<Discard>(snapshots[9]));
  const userId = auth?.currentUser?.uid;
  if (userId) {
    const settingsRef = doc(database, "settings", userId);
    let saved: DocumentData | undefined;
    try {
      saved = (await getDoc(settingsRef)).data();
    } catch (error) {
      if (!isFirebaseOfflineError(error)) throw error;
      try {
        saved = (await getDocFromCache(settingsRef)).data();
      } catch {
        saved = undefined;
      }
    }
    if (saved) {
      settings.expiryAlertDays = Number(
        saved.expiryAlertDays ?? settings.expiryAlertDays,
      );
      settings.donationIntervalDays = Number(
        saved.donationIntervalDays ?? settings.donationIntervalDays,
      );
      settings.lowStockThresholds = {
        ...settings.lowStockThresholds,
        ...saved.lowStockThresholds,
      } as Record<BloodGroup, number>;
    }
  }
  return snapshotWorkflowData();
}

export async function loadCurrentStaffRole(): Promise<Role> {
  if (!firestore || !isFirebaseConfigured) return "admin";
  const id = auth?.currentUser?.uid;
  if (!id) throw new Error("Sign in to continue.");
  const profileRef = doc(firestore, "users", id);
  let profile;
  try {
    profile = await getDoc(profileRef);
  } catch (error) {
    if (!isFirebaseOfflineError(error)) throw error;
    try {
      profile = await getDocFromCache(profileRef);
    } catch {
      throw new Error("Staff access cannot be verified while offline.");
    }
  }
  if (!profile.exists() || profile.data().active !== true)
    throw new Error("This account is not an active hospital staff member.");
  return profile.data().role as Role;
}

function userId() {
  if (!firestore || !isFirebaseConfigured) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine)
    throw new Error(
      "An internet connection is required to save blood bank records safely.",
    );
  const id = auth?.currentUser?.uid;
  if (!id)
    throw new Error("Sign in with an active hospital account to continue.");
  return id;
}
async function patch(collectionName: string, id: string, data: DocumentData) {
  if (firestore && isFirebaseConfigured)
    await updateDoc(doc(firestore, collectionName, id), data);
}
async function addAudit(
  action: string,
  entity: string,
  entityId: string,
  details: string,
) {
  const uid = userId();
  const event: AuditEvent = {
    id: `AUD-${Date.now()}`,
    user:
      auth?.currentUser?.displayName ||
      auth?.currentUser?.email ||
      "Jordan Carter",
    actor:
      auth?.currentUser?.displayName ||
      auth?.currentUser?.email ||
      "Jordan Carter",
    action,
    entity,
    entityId,
    timestamp: new Date().toISOString(),
    details,
  };
  if (firestore && uid) {
    const ref = doc(collection(firestore, "auditLogs"));
    event.id = ref.id;
    await setDoc(ref, { ...event, user: uid, actor: event.actor });
  }
  workflowData.audit.unshift(event);
}

export function getDonor(donorId: string): Donor | undefined {
  return workflowData.donors.find(
    (donor) => donor.id === donorId || donor.donorId === donorId,
  );
}
export function donationEligibility(
  donor: Donor,
  intervalDays = settings.donationIntervalDays,
) {
  const daysSinceLast = donor.lastDonationDate
    ? Math.floor(
        (Date.now() - new Date(donor.lastDonationDate).getTime()) / 86400000,
      )
    : Infinity;
  const deferralActive =
    donor.deferral.type === "permanent" ||
    (donor.deferral.type === "temporary" &&
      (!donor.deferral.until || donor.deferral.until >= localDate()));
  return {
    eligible: !deferralActive && daysSinceLast >= intervalDays,
    deferralActive,
    daysSinceLast,
    nextEligibleDate: donor.lastDonationDate
      ? new Date(
          new Date(donor.lastDonationDate).getTime() + intervalDays * 86400000,
        )
          .toISOString()
          .slice(0, 10)
      : localDate(),
  };
}

export async function createCollection(input: {
  donorId: string;
  hb: number;
  weight: number;
  bp: string;
  pulse: number;
  temp: number;
  campId?: string;
}) {
  userId();
  const donor = getDonor(input.donorId);
  if (!donor)
    throw new Error("Donor not found. Refresh the donor list and try again.");
  const eligibility = donationEligibility(donor);
  if (!eligibility.eligible)
    throw new Error(
      eligibility.deferralActive
        ? "This donor has an active deferral and cannot donate."
        : `Donation interval not met. Next eligible date: ${eligibility.nextEligibleDate}.`,
    );
  if (
    input.hb < 12.5 ||
    input.weight < 45 ||
    input.pulse < 50 ||
    input.pulse > 100 ||
    input.temp > 37.5
  )
    throw new Error("Screening criteria not met. Donation was not collected.");
  const bagNumber = `RHG-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const ref =
    firestore && isFirebaseConfigured
      ? doc(collection(firestore, "donations"))
      : null;
  const donation: Donation = {
    id: ref?.id || `DN-${Date.now()}`,
    donorId: donor.id,
    donorName: donor.name,
    bagNumber,
    date: localDate(),
    volumeMl: 450,
    screening: {
      hb: input.hb,
      weight: input.weight,
      bp: input.bp,
      pulse: input.pulse,
      temp: input.temp,
    },
    status: "testing",
  };
  if (ref)
    await setDoc(ref, {
      ...donation,
      collectedOn: donation.date,
      campId: input.campId || null,
    });
  if (firestore && isFirebaseConfigured)
    await patch("donors", donor.id, { lastDonationDate: donation.date });
  donor.lastDonationDate = donation.date;
  workflowData.donations.unshift(donation);
  if (input.campId) {
    const camp = workflowData.camps.find((item) => item.id === input.campId);
    if (camp) {
      camp.collectedCount += 1;
      await patch("camps", camp.id, { collectedCount: camp.collectedCount });
    }
  }
  await addAudit(
    "Collection recorded",
    "Donation",
    donation.bagNumber,
    `450 mL collected from ${donor.name}.`,
  );
  return donation;
}

export async function recordBloodTests(
  input: Omit<BloodTest, "id" | "testedAt">,
) {
  userId();
  const donation = workflowData.donations.find(
    (item) => item.id === input.donationId,
  );
  if (!donation)
    throw new Error(
      "Donation not found. Refresh the testing queue and try again.",
    );
  if (donation.status === "available")
    throw new Error(
      "This donation has already passed screening and been released.",
    );
  if (!["pending", "A", "B", "AB", "O"].includes(input.abo))
    throw new Error("Select a valid ABO blood group result.");
  if (!["positive", "negative", "pending"].includes(input.rh))
    throw new Error("Select a valid Rh result.");
  const infectionResults = [
    input.hiv,
    input.hbsag,
    input.hcv,
    input.syphilis,
    input.malaria,
  ];
  if (
    infectionResults.some(
      (result) => !["negative", "reactive", "pending"].includes(result),
    )
  )
    throw new Error("Select a valid result for each infection screen.");
  const test: BloodTest = {
    ...input,
    id: input.donationId,
    testedAt: new Date().toISOString(),
  };
  const hasReactive = infectionResults.includes("reactive");
  const groupIsConfirmed = test.abo !== "pending" && test.rh !== "pending";
  const bloodGroup =
    `${test.abo}${test.rh === "positive" ? "+" : "-"}` as BloodGroup;
  const validBloodGroup = [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
  ].includes(bloodGroup);
  if (groupIsConfirmed && !validBloodGroup)
    throw new Error("ABO/Rh result is invalid. Unit remains in testing.");
  const testsComplete =
    infectionResults.every((result) => result === "negative") &&
    groupIsConfirmed &&
    validBloodGroup;
  const donor = workflowData.donors.find(
    (item) => item.id === donation.donorId || item.donorId === donation.donorId,
  );
  if (groupIsConfirmed && validBloodGroup && !donor)
    throw new Error(
      "The donor linked to this donation was not found. Refresh the records before saving the confirmed blood group.",
    );
  const donorNeedsUpdate = Boolean(
    groupIsConfirmed &&
    validBloodGroup &&
    donor &&
    (donor.bloodGroup !== bloodGroup || donor.bloodGroupVerified !== true),
  );
  if (firestore && isFirebaseConfigured) {
    const resultBatch = writeBatch(firestore);
    resultBatch.set(doc(firestore, "tests", donation.id), {
      donationId: donation.id,
      abo: test.abo,
      rh: test.rh,
      hiv: test.hiv,
      hbsag: test.hbsag,
      hcv: test.hcv,
      syphilis: test.syphilis,
      malaria: test.malaria,
      testedAt: test.testedAt,
    });
    if (donorNeedsUpdate && donor) {
      resultBatch.update(doc(firestore, "donors", donor.id), {
        bloodGroup,
        bloodGroupVerified: true,
      });
    }
    await resultBatch.commit();
    const unitRef = doc(firestore, "units", donation.bagNumber);
    const currentUnit = workflowData.units.find(
      (item) => item.id === donation.bagNumber,
    );
    if (hasReactive) {
      await patch("donations", donation.id, { status: "quarantine" });
      donation.status = "quarantine";
    }
    if (groupIsConfirmed && validBloodGroup && (hasReactive || testsComplete)) {
      const unit: Unit = {
        id: donation.bagNumber,
        donationRef: donation.id,
        bloodGroup,
        component: "WHOLE BLOOD",
        status: "testing",
        expiryDate: new Date(Date.now() + 35 * 86400000)
          .toISOString()
          .slice(0, 10),
      };
      const unitData = {
        ...unit,
        expiryDate: Timestamp.fromDate(
          new Date(`${unit.expiryDate}T23:59:59.999Z`),
        ),
      };
      if (!currentUnit) await setDoc(unitRef, unitData);
      const status: Unit["status"] = hasReactive ? "quarantine" : "available";
      if (
        !currentUnit ||
        currentUnit.status !== status ||
        currentUnit.bloodGroup !== bloodGroup
      )
        await updateDoc(unitRef, { status, bloodGroup });
      if (testsComplete) {
        await patch("donations", donation.id, { status: "available" });
        donation.status = "available";
      }
      if (!currentUnit) workflowData.units.unshift({ ...unit, status });
      else {
        currentUnit.status = status;
        currentUnit.bloodGroup = bloodGroup;
      }
    }
  }
  if (groupIsConfirmed && validBloodGroup && donor) {
    donor.bloodGroup = bloodGroup;
    donor.bloodGroupVerified = true;
  }
  const previous = workflowData.tests.findIndex(
    (item) => item.donationId === input.donationId,
  );
  if (previous >= 0) workflowData.tests[previous] = test;
  else workflowData.tests.unshift(test);
  if (hasReactive) {
    donation.status = "quarantine";
    await addAudit(
      "Unit quarantined",
      "Donation",
      donation.bagNumber,
      "A reactive infection-screening result was recorded.",
    );
    return { test, unit: null, status: "quarantine" as const };
  }
  if (!testsComplete) return { test, unit: null, status: "testing" as const };
  donation.status = "available";
  const unit = workflowData.units.find(
    (item) => item.id === donation.bagNumber,
  ) || {
    id: donation.bagNumber,
    donationRef: donation.id,
    bloodGroup,
    component: "WHOLE BLOOD" as const,
    status: "available" as const,
    expiryDate: new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10),
  };
  if (!workflowData.units.includes(unit)) workflowData.units.unshift(unit);
  await addAudit(
    "Unit released",
    "Unit",
    unit.id,
    `All infection screens negative; ${bloodGroup} confirmed.`,
  );
  return { test, unit, status: "available" as const };
}

export const bloodRequestSchema = z.object({
  patient: z.string().trim().min(2, "Enter the patient name."),
  age: z.number().int().min(0).max(120).optional(),
  uhid: z.string().trim().min(1, "Enter the patient UHID."),
  ward: z.string().trim().min(2, "Enter the ward or bed."),
  bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
  doctor: z.string().trim().min(2, "Enter the requesting doctor."),
  diagnosis: z.string().trim().min(2, "Enter the diagnosis."),
  component: z.enum(["PRBC", "PLASMA", "PLATELETS", "WHOLE BLOOD", "CRYO"]),
  units: z.number().int().min(1).max(10),
  urgency: z.enum(["routine", "urgent", "emergency"]),
});

export async function createBloodRequest(
  input: Omit<Request, "id" | "status" | "component"> & { component: string },
) {
  userId();
  const parsed = bloodRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ||
        "Check the request details and try again.",
    );
  const ref =
    firestore && isFirebaseConfigured
      ? doc(collection(firestore, "requests"))
      : null;
  const request: Request = {
    ...parsed.data,
    id:
      ref?.id ||
      `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    status: "Pending",
    issuedUnits: 0,
  };
  if (ref) await setDoc(ref, request);
  workflowData.requests.unshift(request);
  await addAudit(
    "Request created",
    "Request",
    request.id,
    `${request.units} ${request.component} requested for ${request.patient}.`,
  );
  return request;
}

const rbcCompatibility: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-"],
  "O+": ["O-", "O+"],
  "A-": ["O-", "A-"],
  "A+": ["O-", "O+", "A-", "A+"],
  "B-": ["O-", "B-"],
  "B+": ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
};
const plasmaCompatibility: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
  "O+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
  "A-": ["A-", "A+", "AB-", "AB+"],
  "A+": ["A-", "A+", "AB-", "AB+"],
  "B-": ["B-", "B+", "AB-", "AB+"],
  "B+": ["B-", "B+", "AB-", "AB+"],
  "AB-": ["AB-", "AB+"],
  "AB+": ["AB-", "AB+"],
};
function unitCompatible(request: Request, unit: Unit) {
  if (unit.component !== request.component) return false;
  if (request.component === "PLASMA")
    return plasmaCompatibility[request.bloodGroup].includes(unit.bloodGroup);
  if (request.component === "WHOLE BLOOD")
    return unit.bloodGroup === request.bloodGroup;
  return rbcCompatibility[request.bloodGroup].includes(unit.bloodGroup);
}
export function compatibleUnits(request: Request) {
  const matchedUnitIds = new Set(
    workflowData.crossmatches
      .filter(
        (match) =>
          match.requestId === request.id && match.result === "compatible",
      )
      .map((match) => match.unitId),
  );
  return workflowData.units
    .filter(
      (unit) =>
        (unit.status === "available" ||
          (unit.status === "reserved" &&
            (unit.reservedForRequest === request.id ||
              matchedUnitIds.has(unit.id)))) &&
        getUnitDisplayStatus(unit) !== "expired" &&
        unitCompatible(request, unit),
    )
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}
export async function recordCrossmatch(
  requestId: string,
  unitId: string,
  result: "compatible" | "incompatible",
) {
  userId();
  const request = workflowData.requests.find((item) => item.id === requestId);
  const unit = workflowData.units.find((item) => item.id === unitId);
  if (!request || !unit) throw new Error("Request or unit not found.");
  if (["Issued", "Cancelled"].includes(request.status))
    throw new Error("This request is already closed.");
  if (unit.status !== "available" || unit.expiryDate < localDate())
    throw new Error("Unit is not available or has expired.");
  if (result === "compatible" && !unitCompatible(request, unit))
    throw new Error(
      "Blood group or component incompatibility. This unit cannot be cross-matched.",
    );
  if (
    workflowData.crossmatches.some(
      (match) => match.requestId === requestId && match.unitId === unitId,
    )
  )
    throw new Error(
      "This unit already has a cross-match result for the request.",
    );
  const matchRef =
    firestore && isFirebaseConfigured
      ? doc(collection(firestore, "crossmatches"))
      : null;
  const match: Crossmatch = {
    id: matchRef?.id || `XM-${Date.now()}`,
    requestId,
    unitId,
    result,
    doneAt: new Date().toISOString(),
  };
  const alreadyIssued = workflowData.issues.filter(
    (issue) => issue.requestId === requestId,
  ).length;
  const issuedUnitIds = new Set(
    workflowData.issues
      .filter((issue) => issue.requestId === requestId)
      .map((issue) => issue.unitId),
  );
  const matchedUnitIds = new Set(
    workflowData.crossmatches
      .filter(
        (item) =>
          item.requestId === requestId &&
          item.result === "compatible" &&
          !issuedUnitIds.has(item.unitId),
      )
      .map((item) => item.unitId),
  );
  if (result === "compatible") matchedUnitIds.add(unitId);
  const nextStatus: RequestStatus =
    matchedUnitIds.size >= request.units - alreadyIssued
      ? "Ready"
      : alreadyIssued > 0
        ? "Partially Issued"
        : "Crossmatching";
  if (firestore && isFirebaseConfigured) {
    const batch = writeBatch(firestore);
    batch.set(matchRef || doc(firestore, "crossmatches", match.id), match);
    if (result === "compatible") {
      batch.update(doc(firestore, "units", unitId), {
        status: "reserved",
        reservedForRequest: requestId,
      });
    }
    batch.update(doc(firestore, "requests", requestId), { status: nextStatus });
    await batch.commit();
  }
  workflowData.crossmatches.unshift(match);
  if (result === "compatible") {
    unit.status = "reserved";
    unit.reservedForRequest = requestId;
  }
  request.status = nextStatus;
  await addAudit(
    "Cross-match recorded",
    "Unit",
    unitId,
    `${result} for request ${requestId}.`,
  );
  return match;
}
export async function issueBloodUnit(
  requestId: string,
  unitId: string,
  approvedBy?: string,
  emergency = false,
) {
  userId();
  const request = workflowData.requests.find((item) => item.id === requestId);
  const unit = workflowData.units.find((item) => item.id === unitId);
  if (!request || !unit) throw new Error("Request or unit not found.");
  if (["Issued", "Cancelled"].includes(request.status))
    throw new Error("This request is already closed.");
  if (getUnitDisplayStatus(unit) === "expired")
    throw new Error("Expired units cannot be issued.");
  const validEmergency =
    emergency &&
    request.urgency === "emergency" &&
    unit.bloodGroup === "O-" &&
    unitCompatible(request, unit) &&
    Boolean(approvedBy?.trim());
  if (emergency && !validEmergency)
    throw new Error(
      "Emergency quick issue requires an emergency request, O-negative unit, and medical officer approval.",
    );
  const hasCompatibleMatch =
    unit.reservedForRequest === requestId ||
    workflowData.crossmatches.some(
      (match) =>
        match.requestId === requestId &&
        match.unitId === unitId &&
        match.result === "compatible",
    );
  if (!validEmergency && !hasCompatibleMatch)
    throw new Error("A compatible cross-match is required before issuing.");
  if (validEmergency ? unit.status !== "available" : unit.status !== "reserved")
    throw new Error(
      "Unit is not reserved for this request or is no longer available.",
    );
  const existingIssues = workflowData.issues.filter(
    (item) => item.requestId === requestId,
  );
  const issuedCount = request.issuedUnits ?? existingIssues.length;
  if (issuedCount >= request.units)
    throw new Error("This request has already received all requested units.");
  if (existingIssues.some((item) => item.unitId === unitId))
    throw new Error("This unit has already been issued for this request.");
  const issueRef =
    firestore && isFirebaseConfigured
      ? doc(collection(firestore, "issues"))
      : null;
  const issue: Issue = {
    id: issueRef?.id || `ISS-${Date.now()}`,
    requestId,
    unitId,
    issuedTo: request.patient,
    approvedBy: approvedBy || "Medical officer",
    date: new Date().toISOString(),
    emergency,
  };
  let finalStatus: RequestStatus | undefined;
  let finalIssuedCount: number | undefined;
  if (firestore && isFirebaseConfigured) {
    if (!issueRef) throw new Error("Firestore is not ready to save the issue.");
    const requestRef = doc(firestore, "requests", requestId);
    const unitRef = doc(firestore, "units", unitId);
    const requestIssues = query(
      collection(firestore, "issues"),
      where("requestId", "==", requestId),
    );
    const requestCrossmatches = query(
      collection(firestore, "crossmatches"),
      where("requestId", "==", requestId),
    );
    const [issuesSnapshot, matchesSnapshot] = await Promise.all([
      getDocs(requestIssues),
      getDocs(requestCrossmatches),
    ]);
    await runTransaction(firestore, async (transaction) => {
      const [requestSnapshot, unitSnapshot] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(unitRef),
      ]);
      if (!requestSnapshot.exists() || !unitSnapshot.exists())
        throw new Error(
          "Request or unit no longer exists. Refresh and try again.",
        );
      const currentRequest = requestSnapshot.data() as Request;
      const currentUnit = unitSnapshot.data();
      const currentExpiry =
        currentUnit.expiryDate instanceof Timestamp
          ? currentUnit.expiryDate.toDate().toISOString().slice(0, 10)
          : String(currentUnit.expiryDate || "");
      if (currentExpiry < localDate())
        throw new Error("Expired units cannot be issued.");
      if (["Issued", "Cancelled"].includes(currentRequest.status))
        throw new Error("This request is already closed.");
      if (
        emergency &&
        (currentRequest.urgency !== "emergency" ||
          currentUnit.bloodGroup !== "O-" ||
          !approvedBy?.trim() ||
          currentUnit.status !== "available")
      ) {
        throw new Error(
          "Emergency quick issue requires an emergency request, available O-negative unit, and medical officer approval.",
        );
      }
      const currentIssues = issuesSnapshot.docs.map(
        (item) => item.data() as Issue,
      );
      const currentIssuedCount = Number.isInteger(currentRequest.issuedUnits)
        ? (currentRequest.issuedUnits as number)
        : currentIssues.length;
      if (currentIssuedCount >= currentRequest.units)
        throw new Error(
          "This request has already received all requested units.",
        );
      if (currentIssues.some((item) => item.unitId === unitId))
        throw new Error("This unit has already been issued for this request.");
      const currentHasMatch =
        currentUnit.reservedForRequest === requestId ||
        matchesSnapshot.docs.some((item) => {
          const match = item.data();
          return match.unitId === unitId && match.result === "compatible";
        });
      if (!emergency && (!currentHasMatch || currentUnit.status !== "reserved"))
        throw new Error(
          "A compatible unit reserved for this request is required before issuing.",
        );
      if (emergency && currentUnit.status !== "available")
        throw new Error("The emergency unit is no longer available.");
      const nextIssuedCount = currentIssuedCount + 1;
      const alreadyIssuedUnitIds = new Set(
        currentIssues.map((item) => item.unitId),
      );
      const remainingMatches = new Set(
        matchesSnapshot.docs
          .map((item) => item.data())
          .filter(
            (match) =>
              match.result === "compatible" &&
              !alreadyIssuedUnitIds.has(match.unitId) &&
              match.unitId !== unitId,
          )
          .map((match) => String(match.unitId)),
      );
      const remainingUnits = currentRequest.units - nextIssuedCount;
      const status: RequestStatus =
        remainingUnits <= 0
          ? "Issued"
          : remainingMatches.size >= remainingUnits
            ? "Ready"
            : "Partially Issued";
      finalStatus = status;
      finalIssuedCount = nextIssuedCount;
      transaction.update(unitRef, {
        status: "issued",
        ...(emergency
          ? { emergencyRequestId: requestId, emergencyApprovedBy: approvedBy }
          : {}),
      });
      transaction.update(requestRef, { status, issuedUnits: nextIssuedCount });
      transaction.set(issueRef, issue);
    });
  }
  const nextIssuedCount = issuedCount + 1;
  const alreadyIssuedUnitIds = new Set(
    existingIssues.map((item) => item.unitId),
  );
  const remainingMatches = new Set(
    workflowData.crossmatches
      .filter(
        (match) =>
          match.requestId === requestId &&
          match.result === "compatible" &&
          !alreadyIssuedUnitIds.has(match.unitId) &&
          match.unitId !== unitId,
      )
      .map((match) => match.unitId),
  );
  const remainingUnits = request.units - nextIssuedCount;
  const nextStatus: RequestStatus =
    remainingUnits <= 0
      ? "Issued"
      : remainingMatches.size >= remainingUnits
        ? "Ready"
        : "Partially Issued";
  unit.status = "issued";
  request.status = finalStatus ?? nextStatus;
  request.issuedUnits = finalIssuedCount ?? nextIssuedCount;
  workflowData.issues.unshift(issue);
  if (emergency)
    await addAudit(
      "Emergency O-negative issue",
      "Unit",
      unitId,
      `Quick-issued to ${request.patient}; approved by ${approvedBy}.`,
    );
  await addAudit(
    "Unit issued",
    "Unit",
    unitId,
    `Issued to ${request.patient} on request ${requestId}.`,
  );
  return issue;
}
export async function discardBloodUnit(
  unitId: string,
  reason: string,
  approvedBy: string,
) {
  userId();
  const unit = workflowData.units.find((item) => item.id === unitId);
  if (!unit) throw new Error("Unit not found.");
  if (!reason.trim() || !approvedBy.trim())
    throw new Error(
      "A discard reason and medical officer approver are required.",
    );
  if (unit.status === "issued" || unit.status === "discarded")
    throw new Error("Issued or already discarded units cannot be discarded.");
  const discard: Discard = {
    id: `DSC-${Date.now()}`,
    unitId,
    reason,
    approvedBy,
    date: new Date().toISOString(),
  };
  if (firestore && isFirebaseConfigured) {
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, "units", unitId), { status: "discarded" });
    batch.set(doc(firestore, "discards", discard.id), discard);
    await batch.commit();
  }
  unit.status = "discarded";
  workflowData.discards.unshift(discard);
  await addAudit(
    "Unit discarded",
    "Unit",
    unitId,
    `${reason}; approved by ${approvedBy}.`,
  );
  return discard;
}
export async function createBloodCamp(
  input: Omit<Camp, "id" | "collectedCount">,
) {
  userId();
  const ref =
    firestore && isFirebaseConfigured
      ? doc(collection(firestore, "camps"))
      : null;
  const camp: Camp = {
    ...input,
    id: ref?.id || `CAMP-${Date.now()}`,
    collectedCount: 0,
  };
  if (ref) await setDoc(ref, { ...camp, campDate: camp.date });
  workflowData.camps.unshift(camp);
  await addAudit(
    "Camp scheduled",
    "Camp",
    camp.id,
    `${camp.name} at ${camp.place}.`,
  );
  return camp;
}
export async function saveSettings(input: {
  donationIntervalDays: number;
  expiryAlertDays: number;
  lowStockThresholds: Record<BloodGroup, number>;
}) {
  userId();
  Object.assign(settings, input);
  if (firestore && isFirebaseConfigured && auth?.currentUser)
    await setDoc(doc(firestore, "settings", auth.currentUser.uid), input);
  await addAudit(
    "Settings updated",
    "Settings",
    auth?.currentUser?.uid || "demo",
    "Blood bank thresholds and donor policy updated.",
  );
  return settings;
}
export function logAction(
  action: string,
  entity: string,
  entityId: string,
  details: string,
) {
  return addAudit(action, entity, entityId, details);
}
