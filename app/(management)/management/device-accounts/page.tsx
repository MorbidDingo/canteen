"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";

type DeviceType = "GATE" | "KIOSK" | "LIBRARY";

type StaffUser = {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
};

type DeviceAssignment = {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
};

type DeviceRecord = {
  id: string;
  deviceType: DeviceType;
  requiredRole: "ADMIN" | "LIB_OPERATOR" | "ATTENDANCE";
  deviceName: string;
  deviceCode: string;
  status: "ACTIVE" | "DISABLED";
  loginUserId: string | null;
  currentIp: string | null;
  lastIp: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  loginUser: { id: string; name: string; email: string; role: string } | null;
  assignments: DeviceAssignment[];
};

const DEVICE_TYPES: Array<{ value: DeviceType; label: string }> = [
  { value: "GATE", label: "Gate" },
  { value: "KIOSK", label: "Kiosk" },
  { value: "LIBRARY", label: "Library" },
];

export default function ManagementDeviceAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [passwordReveal, setPasswordReveal] = useState<{ email: string; password: string } | null>(null);

  const [deviceType, setDeviceType] = useState<DeviceType>("GATE");
  const [deviceName, setDeviceName] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");

  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [assignUserForDevice, setAssignUserForDevice] = useState<Record<string, string>>({});
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [statusLoadingFor, setStatusLoadingFor] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/management/device-accounts", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to fetch device accounts");
      }
      const data = (await res.json()) as {
        devices: DeviceRecord[];
        staffUsers: StaffUser[];
      };

      setDevices(data.devices || []);
      setStaffUsers(data.staffUsers || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function createDeviceAccount() {
    if (!deviceName.trim() || !deviceCode.trim() || !accountName.trim() || !accountEmail.trim() || !accountPassword.trim()) {
      toast.error("All fields are required");
      return;
    }

    if (accountPassword.trim().length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/management/device-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceType,
          deviceName: deviceName.trim(),
          deviceCode: deviceCode.trim().toUpperCase(),
          accountName: accountName.trim(),
          accountEmail: accountEmail.trim().toLowerCase(),
          accountPassword: accountPassword.trim(),
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string; login?: { email: string; password: string } } | null;

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create device account");
      }

      setPasswordReveal(data?.login || null);
      setDeviceName("");
      setDeviceCode("");
      setAccountName("");
      setAccountEmail("");
      setAccountPassword("");
      toast.success("Device account created");
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  async function assignUser(deviceId: string) {
    const userId = assignUserForDevice[deviceId];
    if (!userId) {
      toast.error("Select a user to assign");
      return;
    }

    setAssigningFor(deviceId);
    try {
      const res = await fetch("/api/management/device-accounts/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, userId }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to assign user");
      }

      toast.success("User assigned");
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign user");
    } finally {
      setAssigningFor(null);
    }
  }

  async function removeAssignment(deviceId: string, userId: string) {
    const key = `${deviceId}:${userId}`;
    setRemovingKey(key);
    try {
      const res = await fetch("/api/management/device-accounts/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, userId }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove assignment");
      }

      toast.success("Assignment removed");
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove assignment");
    } finally {
      setRemovingKey(null);
    }
  }

  async function toggleStatus(device: DeviceRecord) {
    setStatusLoadingFor(device.id);
    try {
      const res = await fetch(`/api/management/device-accounts/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: device.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update device status");
      }

      toast.success(device.status === "ACTIVE" ? "Device disabled" : "Device re-enabled");
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update device status");
    } finally {
      setStatusLoadingFor(null);
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-white p-4">
        <div>
          <h1 className="text-2xl font-semibold">Terminal Device Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Create logins for gate, kiosk, and library terminals. Then assign compatible staff to operate each terminal.
          </p>
        </div>
        <Button variant="outline" onClick={() => void fetchData()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Device Account</CardTitle>
          <CardDescription>Management can create multiple terminals under a single organization.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Device Type</Label>
            <Select value={deviceType} onValueChange={(value) => setDeviceType(value as DeviceType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Device Name</Label>
            <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Gate North Terminal" />
          </div>

          <div className="space-y-2">
            <Label>Device Code</Label>
            <Input value={deviceCode} onChange={(e) => setDeviceCode(e.target.value.toUpperCase())} placeholder="GATE-NORTH-01" />
          </div>

          <div className="space-y-2">
            <Label>Login Name</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="North Gate Operator" />
          </div>

          <div className="space-y-2">
            <Label>Login Email</Label>
            <Input value={accountEmail} onChange={(e) => setAccountEmail(e.target.value.toLowerCase())} placeholder="gate.north@org.com" />
          </div>

          <div className="space-y-2">
            <Label>Login Password</Label>
            <Input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>

          <div className="md:col-span-2">
            <Button onClick={() => void createDeviceAccount()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create Device Account
            </Button>
          </div>

          {passwordReveal ? (
            <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="font-medium text-emerald-800">Credential generated</p>
              <p className="text-emerald-700">Email: {passwordReveal.email}</p>
              <p className="text-emerald-700">Password: {passwordReveal.password}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device Assignments</CardTitle>
          <CardDescription>Assign or remove compatible staff per terminal type.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading devices...
            </div>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device accounts created yet.</p>
          ) : (
            <div className="space-y-4">
              {devices.map((device) => {
                const availableStaff = staffUsers.filter(
                  (staff) =>
                    staff.role === device.requiredRole &&
                    !device.assignments.some((assignment) => assignment.userId === staff.userId),
                );
                const selectedStaffId = assignUserForDevice[device.id] || "";
                return (
                  <div key={device.id} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{device.deviceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {device.deviceType} • {device.deviceCode}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={device.status === "ACTIVE" ? "default" : "secondary"}>{device.status}</Badge>
                        <Button size="sm" variant="outline" onClick={() => void toggleStatus(device)} disabled={statusLoadingFor === device.id}>
                          {statusLoadingFor === device.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : device.status === "ACTIVE" ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                      <p className="font-medium">Login account</p>
                      {device.loginUser ? (
                        <p>{device.loginUser.name} ({device.loginUser.email}) • {device.loginUser.role}</p>
                      ) : (
                        <p className="text-muted-foreground">No login account linked</p>
                      )}
                      <p className="mt-1 text-muted-foreground">
                        IP: {device.currentIp || "Unknown"}
                        {device.lastIp ? ` (prev: ${device.lastIp})` : ""}
                      </p>
                    </div>

                    <div className="mt-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Assigned {device.requiredRole} Users</p>
                      {device.assignments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No assignments yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {device.assignments.map((assignment) => {
                            const key = `${device.id}:${assignment.userId}`;
                            return (
                              <div key={key} className="flex items-center justify-between rounded-md border bg-white p-2 text-xs">
                                <p>
                                  {assignment.userName} ({assignment.userEmail}) • {assignment.role}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void removeAssignment(device.id, assignment.userId)}
                                  disabled={removingKey === key}
                                >
                                  {removingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                      <Select
                        value={selectedStaffId}
                        onValueChange={(value) =>
                          setAssignUserForDevice((prev) => ({
                            ...prev,
                            [device.id]: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select user to assign" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableStaff.map((staff) => (
                            <SelectItem key={staff.userId} value={staff.userId}>
                              {staff.userName} ({staff.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={() => void assignUser(device.id)} disabled={assigningFor === device.id || !selectedStaffId}>
                        {assigningFor === device.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        Assign
                      </Button>
                    </div>

                    <div className="mt-3 text-xs text-muted-foreground">
                      <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                      Management can assign multiple users to each terminal account.
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignable Staff</CardTitle>
          <CardDescription>Active org members who can be assigned to devices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {staffUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active staff users found.</p>
          ) : (
            staffUsers.map((staff) => (
              <div key={staff.userId} className="rounded-md border p-2 text-sm">
                <p className="font-medium">{staff.userName}</p>
                <p className="text-xs text-muted-foreground">{staff.userEmail} • {staff.role}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
