import type { LibraryState, Modal, Page } from '../types'
export interface PageProps {
  state: LibraryState
  setModal: (modal: Modal) => void
  navigate: (page: Page) => void
}
