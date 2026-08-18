/**
 * Chat Panel Store
 * Persists chat panel state across page navigation
 * Includes pop-out mode with localStorage persistence and cross-tab sync
 */

type Listener = () => void;

interface ChatPanelState {
  isOpen: boolean;
  activeConversationId: string | null;
  showConversationList: boolean;
  inputValue: string;
  /** Set of conversation IDs that have pending requests */
  pendingConversations: Set<string>;
  /** Temporary ID for new conversations that haven't been created yet */
  pendingNewConversation: boolean;
  /** Pop-out panel active (floating panel on non-agent pages) */
  isPopoutMode: boolean;
  /** Conversation currently shown in pop-out mode */
  popoutConversationId: string | null;
  /** Current LLM model in use */
  currentModel: string | null;
}

// localStorage key for pop-out persistence
const POPOUT_STORAGE_KEY = 'sentinel-admin-agent-popout';

// BroadcastChannel for cross-tab sync
const SYNC_CHANNEL_NAME = 'sentinel-admin-agent-sync';

// Message types for BroadcastChannel
type SyncMessage =
  | { type: 'POPOUT_STATE_CHANGED'; isPopoutMode: boolean; conversationId: string | null }
  | { type: 'FULL_SCREEN_OPENED' };

// Load persisted pop-out state from localStorage
function loadPopoutState(): { isPopoutMode: boolean; popoutConversationId: string | null } {
  try {
    const stored = localStorage.getItem(POPOUT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        isPopoutMode?: boolean;
        conversationId?: string | null;
      };
      return {
        isPopoutMode: parsed.isPopoutMode ?? false,
        popoutConversationId: parsed.conversationId ?? null,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { isPopoutMode: false, popoutConversationId: null };
}

// Save pop-out state to localStorage
function savePopoutState(isPopoutMode: boolean, conversationId: string | null): void {
  try {
    localStorage.setItem(POPOUT_STORAGE_KEY, JSON.stringify({ isPopoutMode, conversationId }));
  } catch {
    // Ignore storage errors
  }
}

// Initialize pop-out state from localStorage
const persistedPopout = loadPopoutState();

// Module-level state that persists across re-renders and navigation
let state: ChatPanelState = {
  isOpen: false,
  activeConversationId: null,
  showConversationList: true,
  inputValue: '',
  pendingConversations: new Set(),
  pendingNewConversation: false,
  isPopoutMode: persistedPopout.isPopoutMode,
  popoutConversationId: persistedPopout.popoutConversationId,
  currentModel: null,
};

// BroadcastChannel instance (lazy initialization)
let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    broadcastChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
      handleSyncMessage(event.data);
    };
  }
  return broadcastChannel;
}

function handleSyncMessage(message: SyncMessage): void {
  switch (message.type) {
    case 'POPOUT_STATE_CHANGED':
      // Another tab changed pop-out state, sync locally
      updateStateInternal({
        isPopoutMode: message.isPopoutMode,
        popoutConversationId: message.conversationId,
      });
      break;
    case 'FULL_SCREEN_OPENED':
      // Another tab opened full-screen agent page, close pop-out here
      updateStateInternal({
        isPopoutMode: false,
      });
      savePopoutState(false, state.popoutConversationId);
      break;
  }
}

function broadcastMessage(message: SyncMessage): void {
  const channel = getBroadcastChannel();
  if (channel) {
    channel.postMessage(message);
  }
}

const listeners = new Set<Listener>();

// Internal update that doesn't broadcast (used for receiving sync messages)
function updateStateInternal(partial: Partial<ChatPanelState>): void {
  state = { ...state, ...partial };
  listeners.forEach((listener) => listener());
}

function updateState(partial: Partial<ChatPanelState>): void {
  updateStateInternal(partial);
}

export const chatPanelStore = {
  getState(): ChatPanelState {
    return state;
  },

  setIsOpen(isOpen: boolean): void {
    updateState({ isOpen });
  },

  setActiveConversationId(activeConversationId: string | null): void {
    updateState({ activeConversationId });
  },

  setShowConversationList(showConversationList: boolean): void {
    updateState({ showConversationList });
  },

  setInputValue(inputValue: string): void {
    updateState({ inputValue });
  },

  clearInputValue(): void {
    updateState({ inputValue: '' });
  },

  /** Mark a conversation as having a pending request */
  setPending(conversationId: string | null): void {
    if (conversationId) {
      const newSet = new Set(state.pendingConversations);
      newSet.add(conversationId);
      updateState({ pendingConversations: newSet });
    } else {
      updateState({ pendingNewConversation: true });
    }
  },

  /** Clear pending state for a conversation */
  clearPending(conversationId: string | null): void {
    if (conversationId) {
      const newSet = new Set(state.pendingConversations);
      newSet.delete(conversationId);
      updateState({ pendingConversations: newSet, pendingNewConversation: false });
    } else {
      updateState({ pendingNewConversation: false });
    }
  },

  /** Check if a conversation has a pending request */
  isPending(conversationId: string | null): boolean {
    if (conversationId) {
      return state.pendingConversations.has(conversationId);
    }
    return state.pendingNewConversation;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Enable pop-out mode with a specific conversation */
  setPopoutMode(isPopoutMode: boolean, conversationId?: string | null): void {
    const newConversationId =
      conversationId !== undefined ? conversationId : state.popoutConversationId;
    updateState({ isPopoutMode, popoutConversationId: isPopoutMode ? newConversationId : null });
    savePopoutState(isPopoutMode, isPopoutMode ? newConversationId : null);
    broadcastMessage({
      type: 'POPOUT_STATE_CHANGED',
      isPopoutMode,
      conversationId: isPopoutMode ? newConversationId : null,
    });
  },

  /** Set the conversation shown in pop-out mode */
  setPopoutConversationId(conversationId: string | null): void {
    updateState({ popoutConversationId: conversationId });
    if (state.isPopoutMode) {
      savePopoutState(true, conversationId);
      broadcastMessage({
        type: 'POPOUT_STATE_CHANGED',
        isPopoutMode: true,
        conversationId,
      });
    }
  },

  /** Called when full-screen agent page opens to close pop-out in all tabs */
  broadcastFullScreenOpened(): void {
    updateState({ isPopoutMode: false });
    savePopoutState(false, state.popoutConversationId);
    broadcastMessage({ type: 'FULL_SCREEN_OPENED' });
  },

  /** Set the current LLM model being used */
  setCurrentModel(model: string | null): void {
    updateState({ currentModel: model });
  },

  /** Clean up BroadcastChannel when needed */
  cleanup(): void {
    if (broadcastChannel) {
      broadcastChannel.close();
      broadcastChannel = null;
    }
  },
};
