import TrainingLab from '@/components/twin/TrainingLab';

export const metadata = {
  title: 'Annual backtest and ML training | EV Energy Twin',
  description: 'Run a synthetic year in the browser, compare six charging strategies, train on held-out weeks and apply the model in the current DES.',
};

export default function TrainingPage(){return <TrainingLab/>;}
