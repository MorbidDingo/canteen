import crypto from "crypto";

type RazorpayContactInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

type RazorpayBankDetails = {
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountHolderName: string;
};

type RazorpayFundAccountInput =
  | { bankDetails: RazorpayBankDetails; upiVpa?: never }
  | { upiVpa: string; bankDetails?: never };

type RazorpayPayoutInput = {
  fundAccountId: string;
  amountPaise: number;
  reference: string;
};

type RazorpayApiErrorShape = {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
  };
};

function getPayoutCredentials() {
  const keyId = process.env.RAZORPAY_PAYOUT_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_PAYOUT_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    return null;
  }
  return { keyId, keySecret };
}

function getAuthHeader() {
  const creds = getPayoutCredentials();
  if (!creds) {
    throw new Error("RAZORPAY_PAYOUT_CREDENTIALS_MISSING");
  }
  const token = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");
  return `Basic ${token}`;
}

async function razorpayXRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: getAuthHeader(),
      ...(options.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & RazorpayApiErrorShape;
  if (!response.ok) {
    const message =
      data?.error?.description ||
      data?.error?.reason ||
      data?.error?.code ||
      `RazorpayX request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export function hasRazorpayPayoutCredentials() {
  return Boolean(getPayoutCredentials());
}

export async function createContact(input: RazorpayContactInput) {
  // RazorpayX enforces reference_id max length 40.
  const referenceId = `stl_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 40);
  const payload = {
    name: input.name,
    email: input.email || undefined,
    contact: input.phone || undefined,
    type: "vendor",
    reference_id: referenceId,
    notes: {
      source: "canteen_settlement",
    },
  };

  const data = await razorpayXRequest<{ id: string }>("/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return data.id;
}

export async function createFundAccount(contactId: string, input: RazorpayFundAccountInput) {
  let accountType: "bank_account" | "vpa" = "vpa";
  let bankAccount: { name: string; ifsc: string; account_number: string } | undefined;
  let vpa: { address: string } | undefined;

  const bankDetails = input.bankDetails;
  if (bankDetails) {
    accountType = "bank_account";
    bankAccount = {
      name: bankDetails.bankAccountHolderName,
      ifsc: bankDetails.bankIfsc,
      account_number: bankDetails.bankAccountNumber,
    };
  } else {
    accountType = "vpa";
    vpa = { address: input.upiVpa };
  }

  const data = await razorpayXRequest<{ id: string }>("/fund_accounts", {
    method: "POST",
    body: JSON.stringify({
      contact_id: contactId,
      account_type: accountType,
      bank_account: bankAccount,
      vpa,
    }),
  });

  return data.id;
}

export async function createPayout(input: RazorpayPayoutInput) {
  const data = await razorpayXRequest<{ id: string }>("/payouts", {
    method: "POST",
    body: JSON.stringify({
      account_number: "7878780080316316",
      fund_account_id: input.fundAccountId,
      amount: input.amountPaise,
      currency: "INR",
      mode: "IMPS",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: input.reference,
      narration: "Canteen settlement payout",
    }),
  });

  return data.id;
}

export async function getPayoutStatus(payoutId: string) {
  const data = await razorpayXRequest<{ status: string }>(`/payouts/${payoutId}`, {
    method: "GET",
  });

  return data.status;
}
