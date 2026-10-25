import React from 'react';
import {Clapperboard,BookOpen,Puzzle,Database} from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';

/** Compact Nexus Hub identity, using the shared approved icon material. */
export default function NexusBrandMark(){
 return <span className="nh-header-brandmark" aria-hidden="true">
  <MaterialIcon tone="ruby" size={14}><Clapperboard size={35}/></MaterialIcon>
  <MaterialIcon tone="blue" size={14}><BookOpen size={35}/></MaterialIcon>
  <MaterialIcon tone="pink" size={14}><Puzzle size={35}/></MaterialIcon>
  <MaterialIcon tone="violet" size={14}><Database size={35}/></MaterialIcon>
 </span>;
}
