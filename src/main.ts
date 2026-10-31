import './styles.css';
import { createAudio } from './audio';
import { mountConfigScreen } from './ui/configScreen';
import { mountWorkoutScreen } from './ui/workoutScreen';
import { createWakeLock } from './wakeLock';

const root = document.querySelector<HTMLElement>('#app')!;
const audio = createAudio();
const wakeLock = createWakeLock();

function showConfig() {
  mountConfigScreen(root, (config) => {
    // Both must start inside the tap, or iOS refuses them.
    void audio.unlock();
    void wakeLock.acquire();
    mountWorkoutScreen(root, { config, audio, wakeLock }, showConfig);
  });
}

showConfig();
