import React, { useState } from 'react';
import { Plus, TrendingUp, Users, BarChart3, MoreVertical, Edit, Copy, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, StatCard, Modal, Input } from '../../components/ui';
import Container from '../../components/layout/Container';
import PageHeader from '../../components/layout/PageHeader';
import { useToast } from '../../components/ui/Toast';

interface Strategy {
  id: string;
  name: string;
  description: string;
  followers: number;
  status: 'active' | 'inactive';
  pnl: number;
  trades: number;
  winRate: number;
  createdDate: string;
}

// Mock data
const mockStrategies: Strategy[] = [
  {
    id: '1',
    name: 'Momentum Trading Strategy',
    description: 'Focus on trending stocks with high momentum',
    followers: 45,
    status: 'active',
    pnl: 25420.50,
    trades: 152,
    winRate: 68.5,
    createdDate: '2024-01-10',
  },
  {
    id: '2',
    name: 'Swing Trading Strategy',
    description: 'Medium-term positions based on technical analysis',
    followers: 32,
    status: 'active',
    pnl: 18340.20,
    trades: 89,
    winRate: 62.3,
    createdDate: '2024-02-15',
  },
  {
    id: '3',
    name: 'Scalping Strategy',
    description: 'Quick intraday trades for small gains',
    followers: 28,
    status: 'inactive',
    pnl: -1920.00,
    trades: 234,
    winRate: 45.2,
    createdDate: '2024-03-05',
  },
];

const StrategiesPage: React.FC = () => {
  const { addToast } = useToast();
  const [strategies, setStrategies] = useState<Strategy[]>(mockStrategies);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const totalFollowers = strategies.reduce((sum, s) => sum + s.followers, 0);
  const activeStrategies = strategies.filter((s) => s.status === 'active').length;
  const totalPnL = strategies.reduce((sum, s) => sum + s.pnl, 0);

  const handleDelete = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
    addToast({
      type: 'success',
      title: 'Strategy Deleted',
      message: 'Strategy has been deleted successfully',
    });
  };

  return (
    <Container className="py-8">
      <PageHeader
        title="Trading Strategies"
        description="Create and manage your trading strategies"
        actions={
          <Button leftIcon={<Plus className="h-5 w-5" />} onClick={() => setShowCreateModal(true)}>
            Create Strategy
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Active Strategies"
          value={activeStrategies}
          icon={TrendingUp}
          iconColor="text-primary"
        />
        <StatCard
          title="Total Followers"
          value={totalFollowers}
          icon={Users}
          iconColor="text-primary"
        />
        <StatCard
          title="Combined P&L"
          value={`₹${totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          icon={BarChart3}
          iconColor={totalPnL >= 0 ? 'text-profit' : 'text-loss'}
          trend={totalPnL >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* Strategies Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {strategies.map((strategy) => (
          <Card key={strategy.id} variant="elevated" className="hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg mb-1">{strategy.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{strategy.description}</p>
                </div>
                <div className="relative">
                  <button className="p-1 rounded hover:bg-muted transition-colors">
                    <MoreVertical className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      strategy.status === 'active'
                        ? 'bg-profit/10 text-profit'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {strategy.status.charAt(0).toUpperCase() + strategy.status.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Followers</span>
                  <span className="font-semibold font-numbers">{strategy.followers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Win Rate</span>
                  <span className="font-semibold font-numbers">{strategy.winRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Trades</span>
                  <span className="font-semibold font-numbers">{strategy.trades}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">P&L</span>
                  <span
                    className={`font-bold font-numbers ${
                      strategy.pnl >= 0 ? 'text-profit' : 'text-loss'
                    }`}
                  >
                    ₹{strategy.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <Button variant="ghost" size="sm" className="flex-1">
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="flex-1">
                  <Copy className="h-4 w-4 mr-1" />
                  Clone
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(strategy.id)}
                  className="text-loss hover:text-loss"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Strategy Modal */}
      <CreateStrategyModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </Container>
  );
};

// Create Strategy Modal
const CreateStrategyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { addToast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    stopLoss: 2,
    takeProfit: 5,
    maxDrawdown: 10,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addToast({
      type: 'success',
      title: 'Strategy Created',
      message: 'Your trading strategy has been created successfully',
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Strategy" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Strategy Name"
          placeholder="e.g., Momentum Trading"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />

        <div>
          <label className="block text-sm font-medium mb-1.5 text-foreground">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200 bg-background text-foreground resize-none"
            placeholder="Describe your strategy..."
            required
          />
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold text-foreground">Risk Parameters</h4>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-foreground">
              Stop Loss (%)
            </label>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={formData.stopLoss}
              onChange={(e) =>
                setFormData({ ...formData, stopLoss: parseFloat(e.target.value) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>0.5%</span>
              <span className="font-semibold text-foreground">{formData.stopLoss}%</span>
              <span>10%</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-foreground">
              Take Profit (%)
            </label>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={formData.takeProfit}
              onChange={(e) =>
                setFormData({ ...formData, takeProfit: parseFloat(e.target.value) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>1%</span>
              <span className="font-semibold text-foreground">{formData.takeProfit}%</span>
              <span>20%</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-foreground">
              Max Drawdown (%)
            </label>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={formData.maxDrawdown}
              onChange={(e) =>
                setFormData({ ...formData, maxDrawdown: parseFloat(e.target.value) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>5%</span>
              <span className="font-semibold text-foreground">{formData.maxDrawdown}%</span>
              <span>50%</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1">
            Create Strategy
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default StrategiesPage;
