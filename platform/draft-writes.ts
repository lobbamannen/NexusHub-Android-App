import { cancelQueuedEdits } from './api';

/** Called only after the existing UI has confirmed discarding editable drafts. */
export function cancelDraftWrites(scope: 'media' | 'film' | 'stories' | 'all-drafts') {
  void cancelQueuedEdits(scope).catch(error => {
    window.alert('Det väntande sparförsöket kunde inte tas bort. Kontrollera Android-app & GitHub i Inställningar. Ingen automatisk synk körs. ' + (error?.message || ''));
  });
}
