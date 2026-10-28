// Windows master volume for the focus guard's "Faaah" alarm: turn it up to 100% (and unmute) while the alarm plays,
// then put back exactly what you had. A web page can't do this itself, but this server runs on your laptop.
// Uses the Windows Core Audio API from PowerShell (no extra tools). Windows only; elsewhere it reports unsupported.
const { execFile } = require('child_process');

const CS = `
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid ctx);
  int j();
  int GetMasterVolumeLevelScalar(out float fLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
  int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int p, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class LevelUpAudio {
  static IAudioEndpointVolume V() {
    var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; IMMDevice d;
    Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out d));
    IAudioEndpointVolume v; var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(d.Activate(ref id, 23, 0, out v)); return v;
  }
  public static string Get() { float l; bool m; var v = V(); v.GetMasterVolumeLevelScalar(out l); v.GetMute(out m); return l.ToString(System.Globalization.CultureInfo.InvariantCulture) + "|" + (m ? "1" : "0"); }
  public static void Set(float l, bool m) { var v = V(); v.SetMasterVolumeLevelScalar(l, Guid.Empty); v.SetMute(m, Guid.Empty); }
}`;

function ps(command) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(Object.assign(new Error('Volume control works only on Windows'), { status: 501 }));
    const script = `Add-Type -TypeDefinition @'\n${CS}\n'@\n${command}`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim().split('\n')[0]));
      resolve(stdout.trim());
    });
  });
}

const parse = (s) => { const [l, m] = s.split('|'); return { level: Math.round(Number(l) * 100), muted: m === '1' }; };
async function get() { return parse(await ps('[LevelUpAudio]::Get()')); }
async function set(level, muted) {
  const l = Math.max(0, Math.min(100, Math.round(level))) / 100;
  await ps(`[LevelUpAudio]::Set([single]${l.toFixed(2)}, $${muted ? 'true' : 'false'})`);
}

// Boost / restore, with a safety net: the volume always goes back within MAX_BOOST_MS even if the page closes.
const MAX_BOOST_MS = 90_000;
let saved = null;
let safety = null;
let queue = Promise.resolve();
const serial = (fn) => { queue = queue.then(fn, fn); return queue; }; // never two PowerShells racing

function boost() {
  return serial(async () => {
    // one PowerShell call: remember the current volume and go to 100%, unmuted
    const prev = parse(await ps('$p = [LevelUpAudio]::Get(); [LevelUpAudio]::Set([single]1, $false); $p'));
    if (!saved) saved = prev;
    clearTimeout(safety);
    safety = setTimeout(() => { restore().catch(() => {}); }, MAX_BOOST_MS);
    return { boosted: true, previous: saved };
  });
}
function restore() {
  return serial(async () => {
    clearTimeout(safety);
    if (!saved) return { restored: false };
    const prev = saved;
    saved = null;
    await set(prev.level, prev.muted);
    return { restored: true, volume: prev };
  });
}

module.exports = { get, set, boost, restore, MAX_BOOST_MS, _ps: ps, _parse: parse };
