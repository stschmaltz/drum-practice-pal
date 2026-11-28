import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useMarkSongPlayed } from '@/features/library/songPlayed';
import {
  chooseSource,
  SONG_LINK_KIND_LABELS,
  videoSources,
  type PlaySource,
  type SourceChoice,
} from '@/features/recordings/songLinks';
import { useSongLinks, useUsableLinks } from '@/features/recordings/useSongLinks';
import { useOnline } from '@/lib/network';
import { SOURCE_PARAM } from '@/lib/routes';
import { linkedLoopFormOf } from './linkedLoopForm';

const TAB_OPTION: { value: PlaySource; label: string } = { value: 'tab', label: 'Tab' };

/**
 * Which of the song's sources the play screen is on, from `?source=` and the
 * song's links (`chooseSource` has the rules), and the switch between them.
 * The source lives in the URL, replaced at each change, so Back leaves the
 * screen and never steps through the sources. Not offered on a visit that
 * came for the loop form (`?new=1`, `?edit=`): that visit ends with the form.
 *
 * Opening a recording counts as playing the song (`last_played_at`), once per
 * source per visit, and only when its video can show.
 */
export function useSongSources(songId: string) {
  const [params, setParams] = useSearchParams();
  const links = useSongLinks(songId);
  const usable = useUsableLinks(links);
  const forLoopForm = linkedLoopFormOf(params) !== null;

  const choice: SourceChoice = forLoopForm
    ? { state: 'tab', dropRequest: false }
    : chooseSource(params.get(SOURCE_PARAM), {
        data: usable,
        fetching: links.fetchStatus === 'fetching',
        fetchedAfterMount: links.isFetchedAfterMount,
      });
  const videos = forLoopForm ? [] : videoSources(usable ?? []);
  const shown = sourceShown(choice);

  const setSource = useCallback(
    (source: PlaySource) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (source === 'tab') next.delete(SOURCE_PARAM);
          else next.set(SOURCE_PARAM, source);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // The URL named a recording the song doesn't have (settled on a read made since the page
  // opened): it is the tab, and the URL says so, so a link saved later can't switch the
  // source under someone already playing the tab.
  const dropRequest = choice.state === 'tab' && choice.dropRequest;
  useEffect(() => {
    if (dropRequest) setSource('tab');
  }, [dropRequest, setSource]);

  useMarkedPlayed(songId, choice, shown);

  return {
    choice,
    shown,
    choose: setSource,
    /** Tab and each video the song has; a switch is drawn only when there is a choice. */
    options: [
      TAB_OPTION,
      ...videos.map((video): { value: PlaySource; label: string } => ({
        value: video.source,
        label: SONG_LINK_KIND_LABELS[video.source],
      })),
    ],
  };
}

/** The source the switch shows as chosen: a recording still waited for counts as chosen. */
function sourceShown(choice: SourceChoice): PlaySource {
  if (choice.state === 'recording') return choice.video.source;
  return choice.state === 'waiting' ? choice.source : 'tab';
}

/**
 * Records that the song was played along to (`markPlayed`) each time a
 * recording is opened: once per opening of a source, not at each render, and
 * not while offline, when no video shows.
 */
function useMarkedPlayed(songId: string, choice: SourceChoice, shown: PlaySource) {
  const online = useOnline();
  const markPlayed = useMarkSongPlayed();
  // Kept across StrictMode's second run of the effect, so one opening is one write.
  const marked = useRef<PlaySource | null>(null);
  const playing = choice.state === 'recording' && online ? choice.video.source : null;
  useEffect(() => {
    if (playing === null) {
      // Back on the tab: opening the recording again is another opening.
      if (shown === 'tab') marked.current = null;
      return;
    }
    if (marked.current === playing) return;
    marked.current = playing;
    markPlayed(songId);
  }, [playing, shown, songId, markPlayed]);
}
