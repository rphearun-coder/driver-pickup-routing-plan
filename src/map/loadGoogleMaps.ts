import { GOOGLE_MAPS_API_KEY } from '../config';

let loaderPromise: Promise<any> | null = null;

export function loadGoogleMaps(): Promise<any> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;

    script.onload = () => resolve(window.google);
    script.onerror = (err) => reject(err);

    document.head.appendChild(script);
  });

  return loaderPromise;
}
