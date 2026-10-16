export const useParams = () => ({ id: window.__fakeInit.boardId });
export const useRouter = () => ({ back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} });
export const usePathname = () => `/whiteboard/${window.__fakeInit.boardId}`;
export const useSearchParams = () => new URLSearchParams();
export const notFound = () => {
  throw new Error("notFound() called");
};
