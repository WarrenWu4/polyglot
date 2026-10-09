export interface DashboardSet {
  id: number
  name: string
  description: string
  flashcardCount: number
  studyCount: number
  progress: number
}

export interface DashboardData {
  streak: number
  sets: DashboardSet[]
}

export interface SetInfo {
  id: number
  name: string
  description: string
}

export interface SetFace {
  id: number
  name: string
  position: number
}

export interface SetCardField {
  faceId: number
  name: string
  value: string
}

export interface SetCard {
  id: number
  fields: SetCardField[]
}

export interface SetPageData {
  set: SetInfo
  faces: SetFace[]
  cards: SetCard[]
}

export interface HotkeyRow {
  position: number
  key: string
}

export interface StudyField {
  name: string
  value: string
}

export interface StudyCard {
  id: number
  fields: StudyField[]
}

export interface StudyData {
  sessionId: number
  setId: number
  setName: string
  hotkeys: Record<number, string>
  hotkeyRows: HotkeyRow[]
  faceNames: string[]
  cards: StudyCard[]
}

export interface SettingsData {
  hotkeys: HotkeyRow[]
}