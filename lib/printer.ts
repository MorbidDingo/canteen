export type PrinterTransport = "usb" | "bluetooth" | "none";

export type PrinterStatus = {
  connected: boolean;
  transport: PrinterTransport;
  supportsUsb: boolean;
  supportsBluetooth: boolean;
};

type PrintLineItem = {
  name: string;
  quantity: number;
  subtotal: number;
};

type PrintReceiptInput = {
  tokenCode: string;
  items: PrintLineItem[];
  total: number;
  childName?: string;
  isOffline: boolean;
};

const STORAGE_KEY = "venus-printer-transport";
const BT_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const BT_CHARACTERISTIC = "00002af1-0000-1000-8000-00805f9b34fb";

type UsbDeviceLike = {
  configuration: unknown;
  open: () => Promise<void>;
  selectConfiguration: (configurationValue: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<void>;
  close: () => Promise<void>;
};

type NavigatorWithUsb = Navigator & {
  usb: {
    requestDevice: (options: { filters: unknown[] }) => Promise<unknown>;
    getDevices: () => Promise<UsbDeviceLike[]>;
  };
};

type BluetoothCharacteristicLike = {
  writeValueWithoutResponse: (value: BufferSource) => Promise<void>;
};

type BluetoothServiceLike = {
  getCharacteristic: (uuid: string) => Promise<BluetoothCharacteristicLike>;
};

type BluetoothServerLike = {
  getPrimaryService: (uuid: string) => Promise<BluetoothServiceLike>;
};

type BluetoothGattLike = {
  connect: () => Promise<BluetoothServerLike>;
  disconnect: () => void;
};

type BluetoothDeviceLike = {
  gatt?: BluetoothGattLike;
};

type NavigatorWithBluetooth = Navigator & {
  bluetooth: {
    requestDevice: (options: { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<unknown>;
    getDevices: () => Promise<BluetoothDeviceLike[]>;
  };
};

function getSupportsUsb() {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

function getSupportsBluetooth() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

async function getUsbDevices(): Promise<UsbDeviceLike[]> {
  if (!getSupportsUsb()) return [];
  try {
    const usbNavigator = navigator as NavigatorWithUsb;
    return await usbNavigator.usb.getDevices();
  } catch {
    return [];
  }
}

async function getBluetoothDevices(): Promise<BluetoothDeviceLike[]> {
  if (!getSupportsBluetooth()) return [];
  try {
    const bluetoothNavigator = navigator as NavigatorWithBluetooth;
    return await bluetoothNavigator.bluetooth.getDevices();
  } catch {
    return [];
  }
}

export async function connectUsbPrinter(): Promise<boolean> {
  if (!getSupportsUsb()) return false;
  try {
    const usbNavigator = navigator as NavigatorWithUsb;
    await usbNavigator.usb.requestDevice({ filters: [] });
    localStorage.setItem(STORAGE_KEY, "usb");
    return true;
  } catch {
    return false;
  }
}

export async function connectBluetoothPrinter(): Promise<boolean> {
  if (!getSupportsBluetooth()) return false;
  try {
    const bluetoothNavigator = navigator as NavigatorWithBluetooth;
    await bluetoothNavigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [BT_SERVICE] });
    localStorage.setItem(STORAGE_KEY, "bluetooth");
    return true;
  } catch {
    return false;
  }
}

export async function getPrinterStatus(): Promise<PrinterStatus> {
  const supportsUsb = getSupportsUsb();
  const supportsBluetooth = getSupportsBluetooth();
  const preferred = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

  const [usbDevices, bluetoothDevices] = await Promise.all([
    getUsbDevices(),
    getBluetoothDevices(),
  ]);

  const hasUsb = usbDevices.length > 0;
  const hasBluetooth = bluetoothDevices.length > 0;

  if (preferred === "usb" && hasUsb) {
    return { connected: true, transport: "usb", supportsUsb, supportsBluetooth };
  }

  if (preferred === "bluetooth" && hasBluetooth) {
    return { connected: true, transport: "bluetooth", supportsUsb, supportsBluetooth };
  }

  if (hasUsb) {
    return { connected: true, transport: "usb", supportsUsb, supportsBluetooth };
  }

  if (hasBluetooth) {
    return { connected: true, transport: "bluetooth", supportsUsb, supportsBluetooth };
  }

  return { connected: false, transport: "none", supportsUsb, supportsBluetooth };
}

function textEncoderLine(value: string) {
  return new TextEncoder().encode(`${value}\n`);
}

async function printUsb(lines: string[]) {
  const usbNavigator = navigator as NavigatorWithUsb;
  const devices = await usbNavigator.usb.getDevices();
  const device = devices[0];
  if (!device) throw new Error("No USB printer found.");

  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }
  await device.claimInterface(0);

  for (const line of lines) {
    await device.transferOut(1, textEncoderLine(line));
  }

  await device.transferOut(1, new Uint8Array([0x0a, 0x0a, 0x0a]));
  await device.close();
}

async function printBluetooth(lines: string[]) {
  const bluetoothNavigator = navigator as NavigatorWithBluetooth;
  const devices = await bluetoothNavigator.bluetooth.getDevices();
  const device = devices[0];
  if (!device) throw new Error("No Bluetooth printer found.");

  const server = await device.gatt?.connect();
  if (!server) throw new Error("Failed to connect to Bluetooth printer.");

  const service = await server.getPrimaryService(BT_SERVICE);
  const characteristic = await service.getCharacteristic(BT_CHARACTERISTIC);

  for (const line of lines) {
    await characteristic.writeValueWithoutResponse(textEncoderLine(line));
  }
  await characteristic.writeValueWithoutResponse(new Uint8Array([0x0a, 0x0a, 0x0a]));

  device.gatt?.disconnect();
}

export async function printCanteenReceipt(input: PrintReceiptInput): Promise<void> {
  const lines: string[] = [];
  lines.push("VENUS CAFE");
  lines.push(`Token: ${input.tokenCode}`);
  lines.push(input.isOffline ? "Mode: OFFLINE (Queued)" : "Mode: ONLINE");
  lines.push(`Time: ${new Date().toLocaleString()}`);
  if (input.childName) lines.push(`Student: ${input.childName}`);
  lines.push("-----------------------------");
  for (const item of input.items) {
    lines.push(`${item.name} x ${item.quantity}  Rs ${item.subtotal.toFixed(0)}`);
  }
  lines.push("-----------------------------");
  lines.push(`TOTAL: Rs ${input.total.toFixed(0)}`);
  lines.push("Keep this slip for collection");

  const status = await getPrinterStatus();
  if (!status.connected) {
    throw new Error("No connected printer.");
  }

  if (status.transport === "usb") {
    try {
      await printUsb(lines);
      return;
    } catch {
      // If USB fails but Bluetooth is available, fallback once.
      const btDevices = await getBluetoothDevices();
      if (btDevices.length > 0) {
        await printBluetooth(lines);
        return;
      }
      throw new Error("USB printer write failed.");
    }
  }

  if (status.transport === "bluetooth") {
    try {
      await printBluetooth(lines);
      return;
    } catch {
      // If Bluetooth fails but USB is available, fallback once.
      const usbDevices = await getUsbDevices();
      if (usbDevices.length > 0) {
        await printUsb(lines);
        return;
      }
      throw new Error("Bluetooth printer write failed.");
    }
  }

  throw new Error("Printer transport not available.");
}
