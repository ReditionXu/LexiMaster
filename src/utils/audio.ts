/**
 * Audio synthesis utility using Web Speech API
 */
class SpeechManager {
  private synth: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  private initVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    // Prioritize natural English voices
    this.voice =
      voices.find((v) => (v.name.includes('Natural') || v.name.includes('Siri') || v.name.includes('Samantha') || v.name.includes('Daniel')) && v.lang.startsWith('en')) ||
      voices.find((v) => v.lang === 'en-US' || v.lang === 'en-GB') ||
      voices.find((v) => v.lang.startsWith('en')) ||
      null;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public speak(text: string, rate = 0.95) {
    if (!this.synth || !this.enabled || !text) return;

    try {
      this.synth.cancel(); // Stop any pending speech
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) {
        utterance.voice = this.voice;
      }
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';
      this.synth.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis failed', e);
    }
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
    }
  }
}

export const speech = new SpeechManager();
