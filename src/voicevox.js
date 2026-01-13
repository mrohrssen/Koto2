/**
 * VOICEVOX TTS Integration
 * Connects to local VOICEVOX Engine for Japanese text-to-speech
 *
 * @module @jchat/shared/tts
 */

// Default URL, can be configured via configure()
let voicevoxUrl = process.env.VOICEVOX_URL || 'http://localhost:50021';

/**
 * Configure the TTS module
 * @param {object} options
 * @param {string} options.voicevoxUrl - URL of the VOICEVOX engine
 */
export function configure(options) {
  if (options.voicevoxUrl) {
    voicevoxUrl = options.voicevoxUrl;
  }
}

/**
 * Check if VOICEVOX engine is running
 */
export async function isVoicevoxRunning() {
  try {
    const response = await fetch(`${voicevoxUrl}/version`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get available speakers (voices) from VOICEVOX
 */
export async function getSpeakers() {
  try {
    const response = await fetch(`${voicevoxUrl}/speakers`);
    if (!response.ok) {
      throw new Error('Failed to get speakers');
    }
    const speakers = await response.json();

    // Flatten speakers with their styles
    const voices = [];
    for (const speaker of speakers) {
      for (const style of speaker.styles) {
        voices.push({
          id: style.id,
          name: speaker.name,
          style: style.name,
          displayName: `${speaker.name} (${style.name})`
        });
      }
    }
    return voices;
  } catch (error) {
    console.error('VOICEVOX getSpeakers error:', error);
    throw error;
  }
}

/**
 * Synthesize speech from text
 * @param {string} text - Japanese text to speak
 * @param {number} speakerId - VOICEVOX speaker/style ID
 * @param {object} options - Optional parameters (speed, pitch, etc.)
 * @returns {Buffer} - WAV audio data
 */
export async function synthesize(text, speakerId = 1, options = {}) {
  if (!text || text.trim().length === 0) {
    throw new Error('Text is required');
  }

  const {
    speedScale = 1.0,
    pitchScale = 0.0,
    intonationScale = 1.0,
    volumeScale = 1.0
  } = options;

  try {
    // Step 1: Create audio query
    const queryResponse = await fetch(
      `${voicevoxUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
      { method: 'POST' }
    );

    if (!queryResponse.ok) {
      const error = await queryResponse.text();
      throw new Error(`Audio query failed: ${error}`);
    }

    const audioQuery = await queryResponse.json();

    // Apply custom parameters
    audioQuery.speedScale = speedScale;
    audioQuery.pitchScale = pitchScale;
    audioQuery.intonationScale = intonationScale;
    audioQuery.volumeScale = volumeScale;

    // Step 2: Synthesize audio
    const synthesisResponse = await fetch(
      `${voicevoxUrl}/synthesis?speaker=${speakerId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioQuery)
      }
    );

    if (!synthesisResponse.ok) {
      const error = await synthesisResponse.text();
      throw new Error(`Synthesis failed: ${error}`);
    }

    // Return WAV buffer
    const arrayBuffer = await synthesisResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('VOICEVOX synthesis error:', error);
    throw error;
  }
}

/**
 * Get VOICEVOX engine version
 */
export async function getVersion() {
  try {
    const response = await fetch(`${voicevoxUrl}/version`);
    if (!response.ok) {
      throw new Error('Failed to get version');
    }
    return await response.text();
  } catch (error) {
    console.error('VOICEVOX version error:', error);
    throw error;
  }
}
