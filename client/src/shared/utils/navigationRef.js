/**
 * Holds the navigate function from react-router so it can be used outside
 * React components (e.g. in API error handlers). Set by a component inside BrowserRouter.
 */
export const navigationRef = { current: null };
