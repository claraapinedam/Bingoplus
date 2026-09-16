// Shared across every useJsApiLoader() call in this app — @react-google-maps/api keys its loaded
// script by `id` and throws if the same id is ever requested with a different `libraries` array.
// 'geometry' is for MapView's route decoding, 'places' is for BusinessApplyForm's address search.
export const GOOGLE_MAPS_LOADER_ID = 'bingoplus-google-maps';
export const GOOGLE_MAPS_LIBRARIES: ('geometry' | 'places')[] = ['geometry', 'places'];
