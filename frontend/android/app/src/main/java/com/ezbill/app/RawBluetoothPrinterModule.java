package com.ezbill.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ParcelUuid;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Locale;
import java.util.UUID;

// Sends ready-made ESC/POS bytes over Bluetooth. react-native-thermal-printer only prints its own text format,
// where a QR is always sent as a slow image instead of the printer's own QR command.
public class RawBluetoothPrinterModule extends ReactContextBaseJavaModule {
  private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");
  private static final long MIN_CLOSE_DELAY_MS = 300;

  // Nothing reached the printer, so printing another way cannot duplicate the job
  private static final String NOT_CONNECTED = "NOT_CONNECTED";
  // Some bytes may have reached the printer, so a person must check the paper
  private static final String WRITE_FAILED = "WRITE_FAILED";

  public RawBluetoothPrinterModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  @NonNull
  public String getName() {
    return "RawBluetoothPrinter";
  }

  @ReactMethod
  public void print(String macAddress, ReadableArray bytes, Promise promise) {
    byte[] data = new byte[bytes.size()];
    for (int i = 0; i < data.length; i++) {
      data[i] = (byte) bytes.getInt(i);
    }
    // Connecting and writing block, so they must not hold up other native modules
    new Thread(() -> send(macAddress, data, promise), "RawBluetoothPrinter").start();
  }

  @SuppressLint("MissingPermission") // hasConnectPermission() runs first
  private void send(String macAddress, byte[] data, Promise promise) {
    BluetoothManager manager = (BluetoothManager) getReactApplicationContext().getSystemService(Context.BLUETOOTH_SERVICE);
    BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
    if (adapter == null || !adapter.isEnabled()) {
      promise.reject(NOT_CONNECTED, "Bluetooth is turned off.");
      return;
    }
    if (!hasConnectPermission()) {
      promise.reject(NOT_CONNECTED, "Bluetooth permission is not granted.");
      return;
    }
    String address = macAddress == null ? "" : macAddress.trim().toUpperCase(Locale.ROOT);
    if (!BluetoothAdapter.checkBluetoothAddress(address)) {
      promise.reject(NOT_CONNECTED, "No Bluetooth printer address is saved.");
      return;
    }

    BluetoothSocket socket = null;
    try {
      BluetoothDevice device = adapter.getRemoteDevice(address);
      socket = device.createRfcommSocketToServiceRecord(getDeviceUuid(device));
      cancelDiscovery(adapter);
      socket.connect();
    } catch (IOException | RuntimeException e) {
      closeQuietly(socket);
      promise.reject(NOT_CONNECTED, "Could not connect to the Bluetooth printer.", e);
      return;
    }

    try {
      OutputStream output = socket.getOutputStream();
      output.write(data);
      output.flush();
      // Bluetooth does not report when the printer has everything, and closing too soon can cut the slip short
      Thread.sleep(MIN_CLOSE_DELAY_MS + data.length / 16);
    } catch (IOException | InterruptedException | RuntimeException e) {
      closeQuietly(socket);
      promise.reject(WRITE_FAILED, "The Bluetooth connection dropped while printing.", e);
      return;
    }

    closeQuietly(socket);
    promise.resolve(true);
  }

  private boolean hasConnectPermission() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
      || getReactApplicationContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
  }

  // Same choice as react-native-thermal-printer, which already connects to these printers
  @SuppressLint("MissingPermission")
  private UUID getDeviceUuid(BluetoothDevice device) {
    ParcelUuid[] uuids = device.getUuids();
    if (uuids == null || uuids.length == 0) {
      return SPP_UUID;
    }
    for (ParcelUuid uuid : uuids) {
      if (SPP_UUID.equals(uuid.getUuid())) {
        return SPP_UUID;
      }
    }
    return uuids[0].getUuid();
  }

  // Discovery slows connecting, but it needs the scan permission, which printing itself does not
  @SuppressLint("MissingPermission")
  private void cancelDiscovery(BluetoothAdapter adapter) {
    try {
      adapter.cancelDiscovery();
    } catch (SecurityException ignored) {
    }
  }

  private void closeQuietly(BluetoothSocket socket) {
    if (socket == null) {
      return;
    }
    try {
      socket.close();
    } catch (IOException ignored) {
    }
  }
}
