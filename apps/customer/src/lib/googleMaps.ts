// Shared across every useJsApiLoader() call in this app — @react-google-maps/api keys its loaded
// script by `id` and throws if the same id is ever requested with a different `libraries` array,
// so MapView (needs 'geometry' to decode routes) and AddressForm (needs 'places' for the address
// search box) must agree on one id/library set instead of each declaring their own.
export const GOOGLE_MAPS_LOADER_ID = 'bingoplus-google-maps';
export const GOOGLE_MAPS_LIBRARIES: ('geometry' | 'places')[] = ['geometry', 'places'];
