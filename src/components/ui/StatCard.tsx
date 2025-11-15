import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from './Card';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    label: string;
  };
  icon?: LucideIcon;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-primary',
  trend,
  className = '',
}) => {
  const getTrendColor = () => {
    if (!trend) return 'text-muted-foreground';
    if (trend === 'up') return 'text-profit';
    if (trend === 'down') return 'text-loss';
    return 'text-muted-foreground';
  };

  return (
    <Card variant="elevated" className={className}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold font-numbers text-foreground">{value}</p>
            {change && (
              <p className={`text-sm mt-2 ${getTrendColor()}`}>
                <span className="font-semibold">
                  {change.value > 0 && '+'}
                  {change.value}%
                </span>{' '}
                <span className="text-muted-foreground">{change.label}</span>
              </p>
            )}
          </div>
          {Icon && (
            <div className={`h-12 w-12 rounded-lg bg-${iconColor.split('-')[1]}/10 flex items-center justify-center`}>
              <Icon className={`h-6 w-6 ${iconColor}`} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;
