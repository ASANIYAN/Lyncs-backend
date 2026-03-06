import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('clicks')
@Index(['short_code'])
@Index(['clicked_at'])
@Index(['short_code', 'clicked_at'])
export class Click {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Index()
  @Column({ length: 10 })
  short_code: string;

  @Index()
  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  clicked_at: Date;

  @Column('varchar', { length: 45, nullable: true })
  ip_address: string | null;

  @Column('text', { nullable: true })
  user_agent: string | null;

  @Column('text', { nullable: true })
  referrer: string | null;

  @Column('varchar', { length: 2, nullable: true })
  country: string | null;

  @Column('varchar', { length: 20, nullable: true })
  device_type: string | null;

  @Column('varchar', { length: 50, nullable: true })
  browser: string | null;

  @Column('varchar', { length: 50, nullable: true })
  os: string | null;
}
