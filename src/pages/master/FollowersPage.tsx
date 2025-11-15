import React, { useState } from 'react';
import { Plus, Search, MoreVertical, Edit, Trash2, Pause, Play } from 'lucide-react';
import { Button, Input, Card, CardContent, Table, Pagination, Modal, StatCard } from '../../components/ui';
import Container from '../../components/layout/Container';
import PageHeader from '../../components/layout/PageHeader';
import { useToast } from '../../components/ui/Toast';
import type { Column } from '../../components/ui/Table';

interface Follower {
  id: string;
  name: string;
  email: string;
  phone: string;
  scalingFactor: number;
  status: 'active' | 'paused' | 'inactive';
  pnl: number;
  trades: number;
  joinedDate: string;
}

// Mock data
const mockFollowers: Follower[] = [
  {
    id: '1',
    name: 'Rajesh Kumar',
    email: 'rajesh@example.com',
    phone: '+91 98765 43210',
    scalingFactor: 1.0,
    status: 'active',
    pnl: 15420.50,
    trades: 45,
    joinedDate: '2024-01-15',
  },
  {
    id: '2',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    phone: '+91 98765 43211',
    scalingFactor: 0.5,
    status: 'active',
    pnl: -2340.20,
    trades: 32,
    joinedDate: '2024-02-20',
  },
  {
    id: '3',
    name: 'Amit Patel',
    email: 'amit@example.com',
    phone: '+91 98765 43212',
    scalingFactor: 1.5,
    status: 'paused',
    pnl: 8920.00,
    trades: 28,
    joinedDate: '2024-03-10',
  },
];

const FollowersPage: React.FC = () => {
  const { addToast } = useToast();
  const [followers, setFollowers] = useState<Follower[]>(mockFollowers);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const itemsPerPage = 10;

  const filteredFollowers = followers.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredFollowers.length / itemsPerPage);
  const paginatedFollowers = filteredFollowers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleToggleStatus = (id: string) => {
    setFollowers((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, status: f.status === 'active' ? 'paused' : 'active' }
          : f
      )
    );
    addToast({
      type: 'success',
      title: 'Status Updated',
      message: 'Follower status has been updated successfully',
    });
  };

  const handleDelete = (id: string) => {
    setFollowers((prev) => prev.filter((f) => f.id !== id));
    addToast({
      type: 'success',
      title: 'Follower Removed',
      message: 'Follower has been removed successfully',
    });
  };

  const columns: Column<Follower>[] = [
    {
      key: 'name',
      title: 'Name',
      sortable: true,
      render: (_, follower) => (
        <div>
          <p className="font-medium">{follower.name}</p>
          <p className="text-xs text-muted-foreground">{follower.email}</p>
        </div>
      ),
    },
    {
      key: 'phone',
      title: 'Phone',
    },
    {
      key: 'scalingFactor',
      title: 'Scaling Factor',
      render: (value) => <span className="font-numbers">{value}x</span>,
    },
    {
      key: 'status',
      title: 'Status',
      render: (value) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            value === 'active'
              ? 'bg-profit/10 text-profit'
              : value === 'paused'
              ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
    },
    {
      key: 'pnl',
      title: 'P&L',
      sortable: true,
      render: (value) => (
        <span className={`font-numbers font-semibold ${value >= 0 ? 'text-profit' : 'text-loss'}`}>
          ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'trades',
      title: 'Trades',
      render: (value) => <span className="font-numbers">{value}</span>,
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (_, follower) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleToggleStatus(follower.id)}
            className="p-1 rounded hover:bg-muted transition-colors"
            title={follower.status === 'active' ? 'Pause' : 'Resume'}
          >
            {follower.status === 'active' ? (
              <Pause className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Play className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <button
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Edit"
          >
            <Edit className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => handleDelete(follower.id)}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4 text-loss" />
          </button>
        </div>
      ),
    },
  ];

  const totalPnL = followers.reduce((sum, f) => sum + f.pnl, 0);
  const activeFollowers = followers.filter((f) => f.status === 'active').length;

  return (
    <Container className="py-8">
      <PageHeader
        title="Followers Management"
        description="Manage your follower accounts and monitor their performance"
        actions={
          <Button leftIcon={<Plus className="h-5 w-5" />} onClick={() => setShowAddModal(true)}>
            Add Follower
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Total Followers"
          value={followers.length}
          trend="neutral"
        />
        <StatCard
          title="Active Followers"
          value={activeFollowers}
          trend="up"
          change={{ value: 12.5, label: 'from last month' }}
        />
        <StatCard
          title="Total P&L"
          value={`₹${totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          trend={totalPnL >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* Filters and Search */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name or email..."
                leftIcon={<Search className="h-5 w-5" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Followers Table */}
      <Card>
        <CardContent className="p-0">
          <Table data={paginatedFollowers} columns={columns} />
          {totalPages > 1 && (
            <div className="p-4 border-t border-border">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Follower Modal */}
      <AddFollowerModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </Container>
  );
};

// Add Follower Modal Component
const AddFollowerModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { addToast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    scalingFactor: 1.0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Add follower logic
    addToast({
      type: 'success',
      title: 'Follower Added',
      message: 'New follower has been added successfully',
    });
    onClose();
    setFormData({ name: '', email: '', phone: '', scalingFactor: 1.0 });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Follower" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Full Name"
          placeholder="John Doe"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <Input
          label="Email Address"
          type="email"
          placeholder="john@example.com"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
        />
        <Input
          label="Phone Number"
          type="tel"
          placeholder="+91 98765 43210"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          required
        />
        <div>
          <label className="block text-sm font-medium mb-1.5 text-foreground">
            Scaling Factor
          </label>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.1"
            value={formData.scalingFactor}
            onChange={(e) =>
              setFormData({ ...formData, scalingFactor: parseFloat(e.target.value) })
            }
            className="w-full"
          />
          <div className="flex justify-between text-sm text-muted-foreground mt-1">
            <span>0.1x</span>
            <span className="font-semibold text-foreground">{formData.scalingFactor}x</span>
            <span>2.0x</span>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-semibold text-foreground mb-2">IIFL API Credentials</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Configure the follower's IIFL REST API credentials for order execution.
          </p>
          <Input label="API Key" placeholder="Enter API Key" className="mb-4" />
          <Input label="API Secret" type="password" placeholder="Enter API Secret" />
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1">
            Add Follower
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default FollowersPage;
