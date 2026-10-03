export type Role = 'student' | 'staff' | 'warden' | 'admin'

/** Wardens and admins: the people who see every complaint and hand out the work. */
export const isManager = (role: Role | undefined) => role === 'warden' || role === 'admin'
export type Status = 'submitted' | 'assigned' | 'in_progress' | 'fixed' | 'rejected' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  phone: string | null
  /** The picture they uploaded, else their Google photo, else null (the app then shows initials). */
  avatarUrl: string | null
  /** True when avatarUrl is a picture they uploaded themselves (so it can be removed). */
  customAvatar: boolean
  /** Students only: when they may next change hostel or room (ISO time), or null if they can do it now. */
  roomChangeAllowedAt: string | null
  /** 1 when a Google account is connected. */
  googleLinked: number
  /** 1 when notifications are also sent by email. */
  emailNotifications: number
  enrollmentNo: string | null
  hostelId: number | null
  hostelName: string | null
  roomId: number | null
  roomNumber: string | null
  floor: number | null
}

export interface Complaint {
  id: number
  code: string
  description: string
  priority: Priority
  status: Status
  category: { id: number; name: string }
  location: {
    hostelId: number
    hostel: string
    roomId: number | null
    room: string | null
    floor: number | null
    note: string | null
  }
  student: { id: number; name: string; email?: string }
  assignedStaff: { id: number; name: string } | null
  imageUrl: string | null
  resolutionNote: string | null
  resolutionImageUrl: string | null
  createdAt: string
  updatedAt: string
  assignedAt: string | null
  acknowledgedAt: string | null
  resolvedAt: string | null
  dueAt: string
  isOverdue: boolean
}

export interface TimelineItem {
  id: number
  type: 'status' | 'note' | 'priority' | 'assignment'
  fromStatus: Status | null
  toStatus: Status | null
  note: string | null
  imageUrl: string | null
  createdAt: string
  actor: { id: number; name: string; role: Role }
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface Summary {
  byStatus: Record<Status, number>
  overdue: number
  total: number
}

export interface Category {
  id: number
  name: string
}

export interface Hostel {
  id: number
  name: string
  rooms: { id: number; hostelId: number; floor: number; number: string }[]
}

export interface Notification {
  id: number
  title: string
  body: string
  complaintCode: string | null
  read: boolean
  createdAt: string
}

export interface AdminOverview {
  now: { open: number; unassigned: number; assigned: number; inProgress: number; highPriority: number; overdue: number; total: number }
  range: {
    days: number
    opened: number
    fixed: number
    avgResolutionHours: number | null
    trend: { date: string; opened: number; fixed: number }[]
    byCategory: { name: string; count: number }[]
    byHostel: { name: string; count: number }[]
  }
}

/** One place the person is signed in (a browser or phone). */
export interface DeviceSession {
  id: string
  device: string
  ip: string | null
  createdAt: string
  lastSeenAt: string
  /** True for the device making this request. */
  current: boolean
}

export interface ManagedUser {
  id: number
  name: string
  email: string
  role: 'student' | 'staff' | 'warden'
  phone: string | null
  active: boolean
  avatarUrl: string | null
  googleLinked: boolean
  createdAt: string
  specialty: string | null
  hostel: string | null
  room: string | null
  complaintsFiled: number
  openAssigned: number
}

export interface AdminHostel {
  id: number
  name: string
  complaints: number
  rooms: { id: number; floor: number; number: string; complaints: number; students: number }[]
}

export interface AdminCategory {
  id: number
  name: string
  active: boolean
  complaints: number
}

