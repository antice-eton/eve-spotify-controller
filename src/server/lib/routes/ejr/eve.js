const express = require('express');
const apiRoutes = express.Router();
const passport = require('passport');
const appConfig = require('../../../config.js');

const models = require('../../../models.js');
const User = models.User;
const Character = models.Character;

const fs = require('fs');
const mkdirp = require('mkdirp');
const axios = require('axios');

const Seq = require('sequelize');

const asyncMiddleware = require('../routeUtils.js').asyncMiddleware;

const sessionState = require('../../ws/sessionState.js').get_state;

async function eve_sso_callback(accessToken, refreshToken, profile, done) {

    const character = await Character.create({
        character_id: profile.CharacterID,
        character_name: profile.CharacterName,
        expires_on: profile.ExpiresOn,
        access_token:  accessToken,
        refresh_token: refreshToken,
        token_created: new Date()
    });

    const image_url = 'https://image.eveonline.com/Character/' + character.character_id + '_512.jpg';

    const portrait_dir = appConfig.images_dir + '/portraits';

    if (!fs.existsSync(portrait_dir)) {
        mkdirp.sync(portrait_dir);
    }

    const dl_target = portrait_dir + '/' + character.character_id + '_512.jpg';

    if (fs.existsSync(dl_target)) {
        fs.unlinkSync(dl_target);
    }

    const res = await axios({
        method: 'GET',
        url: image_url,
        responseType: 'arraybuffer'
    });

    fs.writeFileSync(dl_target, res.data);

    return done(null, profile);
}

apiRoutes.get('/api/eve/stations', asyncMiddleware(async (req, res, next) => {
    if (req.query['q']) {
        const stations = await models.EveStation.findAll({
            where: {
                name: {
                    [Seq.Op.iLike]: req.query['q'] + '%'
                }
            }
        });

        res.json({
            stations: stations
        });
    } else {
        const stations = await models.EveStation.findAll();

        res.json({
            stations: stations
        });
    }
}));

apiRoutes.get('/api/eve/regions', asyncMiddleware(async (req, res, next) => {
    if (req.query['q']) {
        const regions = await models.EveRegion.findAll({
            where: {
                name: {
                    [Seq.Op.iLike]: req.query['q'] + '%'
                }
            }
        });

        res.json({
            regions: regions
        });
    } else {
        const regions = await models.EveRegion.findAll();

        res.json({
            regions: regions
        });
    }
}));

apiRoutes.get('/api/eve/systems', asyncMiddleware(async (req, res, next) => {

    if (req.query['q']) {

        const systems = await models.EveSystem.findAll({
            where: {
                name: {
                    [Seq.Op.iLike]: req.query['q'] + '%'
                }
            }
        });

        res.json({
            systems: systems
        });
    } else {
        const systems = await models.EveSystem.findAll();

        res.json({
            systems: systems
        });
    }
}));

apiRoutes.get('/api/eve/verify',
    passport.authenticate('eveonline-sso', {failureRedirect: '/api/eve/verify-error', session: false}),
    async function(req, res) {

        const user = await User.findOne({where: { session_id: req.session.id }});
        const char = await Character.findOne({ where: { character_id: req.user.CharacterID}});

        await user.addCharacter(char);
        res.send(`
        <html><body><script>
            var spotifyEvent = new CustomEvent('refresh-eve-characters', {
                detail: {
                    hash: window.location.hash
                }
            });
            window.opener.document.dispatchEvent(spotifyEvent);
            // window.close();
        </script></body></html>
        `);
    }
);

apiRoutes.get('/api/eve/eve_characters/:character_id/location', asyncMiddleware(async(req, res, next) => {
    const user = await User.findOne({where: {session_id: req.session.id}});
    const character = await user.getCharacters({where: {character_id: req.params.character_id}});

    if (!character[0]) {
        res.status(404).send('Char id not found');
        return;
    }

    try {
        const ec = new eveClient(character[0], appConfig['eve']);
        const eveRes = await ec.location();

        const systemData = await ec.systemInfo(eveRes.data.solar_system_id);
        const sovData = await ec.sovInfo(eveRes.data.solar_system_id);

        systemData['sov'] = sovData;
        systemData['location'] = eveRes.data;

        if (systemData['sov']['faction_id']) {
            systemData['faction'] = await ec.factionInfo(systemData['sov']['faction_id']);
        }

        if (eveRes.data['structure_id']) {
            systemData['structure'] = {
                structure_id: eveRes.data['structure_id']
            };
        }

        if (eveRes.data['station_id']) {
            systemData['station'] = await ec.stationInfo(eveRes.data['station_id']);
        }

        res.set({
            'expires': eveRes.headers['expires'],
            'cache-control': eveRes.headers['cache-control'],
            'last-modified': eveRes.headers['last-modified'],
            'access-control-max-age': eveRes.headers['access-control-max-age']
        }).json(systemData);

    } catch (err) {
        if (err.response) {
            console.error('[ESC] Error getting character location', err.response);
        } else {
            console.error('[ESC] Error getting character location', err);
        }
        res.status(500).send('Error getting character location');
        return;
    }
}));

apiRoutes.get('/api/eve/eve_characters/:character_id/status', asyncMiddleware(async (req, res, next) => {

    const user = await User.findOne({where: {session_id: req.session.id}});
    const character = await user.getCharacters({where: {character_id: req.params.character_id}});

    if (!character[0]) {
        res.status(404).send('Char id not found');
        return;
    }

    try {
        const ec = new eveClient(character[0], appConfig['eve']);
        const eveRes = await ec.onlineStatus();

        res.set({
            'expires': eveRes.headers['expires'],
            'cache-control': eveRes.headers['cache-control'],
            'last-modified': eveRes.headers['last-modified'],
            'access-control-max-age': eveRes.headers['access-control-max-age']
        }).json(eveRes.data);

    } catch (err) {
        console.error('[ESC] Error getting character status', err.response);
        res.status(500).send('Error getting character status');
        return;
    }
}));

apiRoutes.get('/api/eve/verify-error', (req, res) => {
    res.status(500).send('Error validating EVE SSO');
});

apiRoutes.get('/api/eve/login',
    passport.authenticate('eveonline-sso', {failureRedirect: '/api/eve/login-error', session: false})
);

apiRoutes.get('/api/eve/login-error', (req, res) => {
    res.status(500).send('Error logging in via EVE SSO');
});

apiRoutes.get('/api/eve/characters', asyncMiddleware(async (req, res, next) => {

    const user = await User.findOne({where: {session_id: req.session.id}});

    if (user) {
        console.log('[ESC] User has entry in session db');
        const characters = await user.getCharacters();
        res.json({ characters: characters.map((char) => {
            return {
                character_id: char.character_id,
                character_name: char.character_name,
                createdAt: char.createdAt,
                expires_on: char.expires_on,
                token_created: char.token_created
            };
        })});
    } else {
        console.log('[ESC] Session not in db, creating');
        const user = await User.create({ session_id: req.session.id});

        console.log('[ESC] User created with id:', user.id);
        res.json({ characters: []});
    }
}));

apiRoutes.delete('/api/eve/eve_characters/:character_id', asyncMiddleware(async (req, res, next) => {

    // does character id belong to this session???
    console.log('[ESC] Deleting char: ', req.params.character_id);

    const user = await User.findOne({ where: { session_id: req.session.id }});
    const character = await user.getCharacters({where: {character_id: req.params.character_id}});

    if (character[0]) {
        await character[0].destroy();
        res.send('ok');
    } else {
        res.status(404).send('character id not found');
    }

}));

apiRoutes.post('/api/eve/active_character', asyncMiddleware(async(req, res, next) => {
    if (!req.body.character_id) {
        throw new Error('Missing character_id');
    }

    const user = await User.findOne({ where: { session_id: req.session.id }});
    user.active_character_id = req.body.character_id;
    await user.save();

    req.session.active_character_id = req.body.character_id;
    sessionState(req.session.id).refresh_user = true;
    res.send('ok');
}));

apiRoutes.delete('/api/eve/active_character', asyncMiddleware(async (req, res, next) => {
    const user = await User.findOne({ where: { session_id: req.session.id }});
    user.active_character_id = null;
    req.session.active_character_id = null;
    sessionState(req.session.id).refresh_user = true;
    res.send('ok');
}));

apiRoutes.get('/api/eve/active_character', asyncMiddleware(async (req, res, next) => {

    const user = await User.findOne({where: {session_id: req.session.id}});

    if (!user) {
        res.status(403).send('No active session user');
        return;
    }

    if (!user.active_character_id) {
        res.status(403).send('No active characters');
        return;
    }

    const characters = await user.getCharacters({
        where: {
            character_id: user.active_character_id
        }
    });

    if (!characters[0]) {
        res.status(403).send('User active character id has no coresponding character');
        return;
    }

    const char = characters[0];

    res.json({
        character_id: char.character_id,
        character_name: char.character_name,
        createdAt: char.createdAt,
        expires_on: char.expires_on,
        token_created: char.token_created
    });
}));

module.exports = {
    routes: apiRoutes,
    eve_sso_callback
};
