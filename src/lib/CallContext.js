import { createContext, useContext } from 'react'

// Shared context so any page can access the global call object
// (e.g. Chat.jsx needs call.startCall without owning the hook)
export const CallContext = createContext(null)
export const useCall = () => useContext(CallContext)
