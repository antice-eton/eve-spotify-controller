const sessions = {};

function new_state() {
    return {
        active_character_id: null,
        active_musicsource_id: null,
        active_character: null,
        user: null,
        ticking: false,
        previous_tick_data: {},
        cached_data: {},
        ws_client: null,
        status_client: null,
        universe_client: null,
        timer: null,
        tick_counter: 0,
        new_character: false
    };
}

function delete_state(sessionId) {
    if (sessions[sessionId]) {
        delete sessions[sessionId];
    }
}

function get_state(sessionId) {
    if (!sessions[sessionId]) {
        console.log('mkaing new state for:', sessionId);
        sessions[sessionId] = new_state();
    }

    return sessions[sessionId];
}

module.exports = {
    new_state,
    delete_state,
    get_state
};
