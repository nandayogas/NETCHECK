// Riwayat pengujian nyata, disimpan di perangkat (localStorage), maksimal 50 entri.
const K = 'nc_hist';
export const hist = () => { try { return JSON.parse(localStorage.getItem(K)) || []; } catch { return []; } };
export const addHist = e => { try { localStorage.setItem(K, JSON.stringify([{ t: Date.now(), ...e }, ...hist()].slice(0, 50))); } catch {} };
export const clearHist = () => { try { localStorage.removeItem(K); } catch {} };
