import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    { error: "Payment status is managed by the payment system and cannot be changed manually" },
    { status: 403 }
  );
}
