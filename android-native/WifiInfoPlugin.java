package com.netcheck.app;

import android.Manifest;
import android.content.Context;
import android.location.LocationManager;
import android.net.wifi.ScanResult;
import android.net.wifi.SupplicantState;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.List;
import org.json.JSONArray;

@CapacitorPlugin(
    name = "WifiInfo",
    permissions = { @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location") }
)
public class WifiInfoPlugin extends Plugin {

  private WifiManager wm() {
    return (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
  }

  private boolean hasLocation() {
    return getPermissionState("location") == PermissionState.GRANTED;
  }

  // Channel dari frekuensi (MHz)
  private static int channelOf(int f) {
    if (f == 2484) return 14;
    if (f >= 2412 && f <= 2472) return (f - 2407) / 5;
    if (f >= 5000 && f <= 5900) return (f - 5000) / 5;
    if (f >= 5955 && f <= 7115) return (f - 5950) / 5;
    return 0;
  }

  private static String bandOf(int f) {
    if (f < 3000) return "2.4 GHz";
    if (f < 5900) return "5 GHz";
    return "6 GHz";
  }

  @PluginMethod
  public void requestLocation(PluginCall call) {
    if (hasLocation()) {
      JSObject r = new JSObject();
      r.put("granted", true);
      call.resolve(r);
      return;
    }
    requestPermissionForAlias("location", call, "locationCallback");
  }

  @PermissionCallback
  private void locationCallback(PluginCall call) {
    JSObject r = new JSObject();
    r.put("granted", hasLocation());
    call.resolve(r);
  }

  @PluginMethod
  public void status(PluginCall call) {
    try {
      WifiManager m = wm();
      LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
      boolean locOn = Build.VERSION.SDK_INT < Build.VERSION_CODES.P || (lm != null && lm.isLocationEnabled());

      JSObject r = new JSObject();
      r.put("locationGranted", hasLocation());
      r.put("locationOn", locOn);
      r.put("wifiEnabled", m.isWifiEnabled());

      WifiInfo info = m.getConnectionInfo();
      boolean connected = info != null && info.getSupplicantState() == SupplicantState.COMPLETED;
      r.put("connected", connected);

      if (info != null) {
        String ssid = info.getSSID();
        r.put("ssid", ssid == null ? "" : ssid.replace("\"", ""));
        String bssid = info.getBSSID();
        r.put("bssid", bssid == null ? "" : bssid);
        r.put("rssi", info.getRssi());
        int f = info.getFrequency();
        r.put("frequency", f);
        r.put("band", bandOf(f));
        r.put("channel", channelOf(f));
        r.put("linkSpeed", info.getLinkSpeed());
        int ip = info.getIpAddress();
        r.put("ip", ip == 0 ? "" : (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + "." + ((ip >>> 24) & 0xff));
      }
      call.resolve(r);
    } catch (Exception e) {
      call.reject(e.getMessage());
    }
  }

  @PluginMethod
  public void scan(PluginCall call) {
    if (!hasLocation()) {
      call.reject("Izin lokasi belum diberikan");
      return;
    }
    new Thread(() -> {
      try {
        WifiManager m = wm();
        // Sistem membatasi frekuensi pemindaian, jadi hasilnya bisa berupa data pemindaian sebelumnya
        m.startScan();
        Thread.sleep(3000);
        List<ScanResult> list = m.getScanResults();
        JSONArray arr = new JSONArray();
        if (list != null) {
          for (ScanResult s : list) {
            JSObject o = new JSObject();
            String name = s.SSID == null ? "" : s.SSID;
            o.put("ssid", name.isEmpty() ? "(tersembunyi)" : name);
            o.put("bssid", s.BSSID == null ? "" : s.BSSID);
            o.put("rssi", s.level);
            o.put("frequency", s.frequency);
            o.put("band", bandOf(s.frequency));
            o.put("channel", channelOf(s.frequency));
            arr.put(o);
          }
        }
        JSObject r = new JSObject();
        r.put("networks", arr);
        call.resolve(r);
      } catch (Exception e) {
        call.reject(e.getMessage());
      }
    }).start();
  }
}
