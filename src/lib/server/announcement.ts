// The announcement lives in the unified control store now; this module stays as a thin
// re-export so existing imports keep working.
export { clearAnnouncement, getAnnouncement, setAnnouncement, type Announcement } from "./control";
