// The realtime scope for the table.
//
// Its own module with no imports: the client needs the string to subscribe and
// the server needs it to publish, and putting it beside the publisher pulled
// next/server's after() into the browser bundle.
export const GAME_SCOPE = "game:roulette";
