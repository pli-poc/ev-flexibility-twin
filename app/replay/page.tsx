import type {Metadata} from 'next';
import ReplayLab from '@/components/twin/ReplayLab';

export const metadata:Metadata={title:'Deterministic replay lab · Energy Twin',description:'Replay synthetic EMS signals, inspect safe plans, and reconcile virtual charger feedback.'};

export default function ReplayPage(){return <ReplayLab/>;}
